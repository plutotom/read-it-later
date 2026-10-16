import XCTest
@testable import ReadingCore

private actor ControlledSpeechService: SpeechService {
    nonisolated let voices = [SpeechVoice(id: "a", name: "A", language: "en"), SpeechVoice(id: "b", name: "B", language: "en")]
    nonisolated let configurationID = "test-v1"
    var calls: [SpeechRequest] = []
    var pending: [Int: CheckedContinuation<SpeechResponse, any Error>] = [:]
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        let index = calls.count
        calls.append(request)
        // Deliberately ignores cancellation to verify stale responses cannot take over.
        return try await withCheckedThrowingContinuation { pending[index] = $0 }
    }
    func count() -> Int { calls.count }
    func request(_ index: Int) -> SpeechRequest { calls[index] }
    func complete(_ index: Int, duration: Double = 10) {
        let request = calls[index]
        let first = try! NSRegularExpression(pattern: #"\S+"#).firstMatch(in: request.text, range: NSRange(location: 0, length: request.text.utf16.count))!.range
        pending.removeValue(forKey: index)?.resume(returning: SpeechResponse(audio: .simulated, duration: duration, marks: [SpeechMark(range: first, start: 0, end: duration)]))
    }
    func fail(_ index: Int) { pending.removeValue(forKey: index)?.resume(throwing: URLError(.notConnectedToInternet)) }
    func finishAll() { for index in Array(pending.keys) { complete(index) } }
}

private actor ImmediateSpeechService: SpeechService {
    nonisolated let voices = [SpeechVoice(id: "a", name: "A", language: "en")]
    nonisolated let configurationID = "cache-test"
    var texts: [String] = []
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        texts.append(request.text)
        return SpeechResponse(audio: .encoded(Data(repeating: 0, count: 2_000_000), contentType: "audio/test"), duration: 1, marks: [])
    }
}

@MainActor private final class ManualTransport: SpeechTransport {
    var position = 0.0
    var playing = false
    var rate = 1.0
    var loads = 0
    var failureMessage: String?
    func load(_ response: SpeechResponse, at time: TimeInterval) throws { position = time; failureMessage = nil; loads += 1 }
    func play(rate: Double) { playing = true; self.rate = rate }
    func pause() { playing = false }
    func unload() { playing = false; position = 0 }
    func seek(to time: TimeInterval) { position = time }
}

final class ListeningTests: XCTestCase {
    private let document = ListeningDocument(articleID: "article", title: "Test", text: "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.\n\nFourth paragraph here.\n\nFifth paragraph here.")

    @MainActor private func wait(_ condition: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<2000 {
            if await condition() { return }
            try? await Task.sleep(for: .milliseconds(1))
        }
        XCTFail("Condition did not become true", file: file, line: line)
    }

    func testChunkingPreservesUnicodeOffsetsAndBoundsLargeParagraphs() {
        let text = "  Hello 👨‍👩‍👧‍👦 café 🌎\n\n" + String(repeating: "One sentence. ", count: 200) + "\n\n" + String(repeating: "漢", count: 5000)
        let document = ListeningDocument(articleID: "unicode", title: "Test", text: text)
        XCTAssertEqual(document.paragraphs.count, 3)
        XCTAssertEqual((text as NSString).substring(with: document.paragraphs[0]), "Hello 👨‍👩‍👧‍👦 café 🌎")
        XCTAssertGreaterThan(document.chunks.count, 5)
        for chunk in document.chunks {
            XCTAssertEqual((text as NSString).substring(with: chunk.range), chunk.text)
            XCTAssertNotNil(Range(chunk.range, in: text))
            XCTAssertLessThanOrEqual(chunk.range.length, 2000)
            XCTAssertEqual(document.chunk(atUTF16Offset: chunk.range.location), chunk.id)
        }
        XCTAssertTrue(ListeningDocument(articleID: "empty", title: "", text: " \n\n ").chunks.isEmpty)
    }

    @MainActor func testSelectedParagraphStartsWithoutWaitingForLookaheadAndReusesCache() async {
        let service = ControlledSpeechService(); let transport = ManualTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        player.start(document, paragraph: 1)
        await wait { await service.count() == 3 }
        let first = await service.request(0)
        XCTAssertEqual(first.text, "Second paragraph here.")
        await service.complete(0)
        await wait { player.state == .playing }
        XCTAssertEqual(player.chunkIndex, 1)
        XCTAssertEqual(transport.loads, 1)
        XCTAssertEqual(player.wordRange?.location, document.paragraphs[1].location)
        player.pause()
        player.start(document, paragraph: 1)
        XCTAssertEqual(player.state, .playing)
        XCTAssertEqual(transport.loads, 2)
        // Only lookahead can be requested again; selected content came from cache.
        await wait { await service.count() >= 5 }
        let calls = await service.calls
        XCTAssertEqual(calls.filter { $0.text == "Second paragraph here." }.count, 1)
        player.close(); await service.finishAll()
    }

    @MainActor func testJumpAndVoiceChangeRejectStaleResponsesAndPauseDuringBuffering() async {
        let service = ControlledSpeechService(); let transport = ManualTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        player.start(document)
        await wait { await service.count() == 3 }
        player.start(document, paragraph: 4)
        await wait { await service.count() == 4 }
        await service.complete(0)
        await Task.yield()
        XCTAssertEqual(player.chunkIndex, 4)
        XCTAssertEqual(transport.loads, 0)
        player.pause()
        await service.complete(3)
        await wait { transport.loads == 1 }
        XCTAssertEqual(player.state, .paused)
        XCTAssertFalse(transport.playing)
        player.setVoice(player.voices[1])
        await wait { await service.count() == 5 }
        let request = await service.request(4)
        XCTAssertEqual(request.voice.id, "b")
        await service.complete(4, duration: 20)
        await wait { transport.loads == 2 }
        XCTAssertEqual(player.state, .paused)
        player.close(); await service.finishAll()
        XCTAssertNil(player.document)
    }

    @MainActor func testTransitionsSeekingRateSleepAndCompletion() async {
        let service = ControlledSpeechService(); let transport = ManualTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        player.start(document)
        await wait { await service.count() == 3 }
        await service.complete(0); await service.complete(1); await service.complete(2)
        await wait { player.durations.count == 3 }
        player.setRate(2)
        XCTAssertEqual(transport.rate, 2)
        transport.position = 10; player.tick()
        XCTAssertEqual(player.chunkIndex, 1)
        XCTAssertEqual(player.state, .playing)
        player.pause(); player.seek(to: 15)
        XCTAssertEqual(player.chunkIndex, 1)
        XCTAssertEqual(transport.position, 5)
        XCTAssertTrue(player.isPlaying)
        player.setSleep(minutes: 5)
        let deadline = player.sleepDeadline!
        player.tick(now: deadline.addingTimeInterval(1))
        XCTAssertFalse(player.isPlaying)
        XCTAssertNil(player.sleepDeadline)
        player.start(document, paragraph: 4)
        await wait { await service.count() >= 5 }
        // Locate the latest request; lookahead ordering is deliberately not asserted.
        let calls = await service.calls
        let last = calls.lastIndex(where: { $0.text == "Fifth paragraph here." })!
        await service.complete(last)
        await wait { player.state == .playing }
        player.setSleepAtEnd()
        transport.position = 10; player.tick()
        XCTAssertEqual(player.state, .finished)
        XCTAssertFalse(player.isPlaying)
        XCTAssertFalse(player.sleepAtEnd)
        player.pause()
        XCTAssertEqual(player.state, .finished)
        player.close(); await service.finishAll()
    }

    @MainActor func testFailureCanRetryAndClosingIgnoresLateResults() async {
        let service = ControlledSpeechService(); let transport = ManualTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        player.start(document, paragraph: 4)
        await wait { await service.count() == 1 }
        await service.fail(0)
        await wait { if case .failed = player.state { return true }; return false }
        player.resume()
        await wait { await service.count() == 2 }
        player.close()
        await service.complete(1)
        await Task.yield()
        XCTAssertEqual(player.state, .idle)
        XCTAssertEqual(transport.loads, 0)
    }

    @MainActor func testTransportFailureEvictsBrokenResponseForRetry() async {
        let service = ControlledSpeechService(); let transport = ManualTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        player.start(document, paragraph: 4)
        await wait { await service.count() == 1 }
        await service.complete(0)
        await wait { player.state == .playing }
        transport.failureMessage = "Decoder stopped"
        player.tick()
        XCTAssertEqual(player.state, .failed("Decoder stopped"))
        XCTAssertEqual(player.cachedChunkCount, 0)
        player.resume()
        await wait { await service.count() == 2 }
        await service.complete(1)
        await wait { player.state == .playing }
        player.close()
    }

    @MainActor func testCacheEvictsOldEncodedResponsesWithinMemoryBudget() async {
        let service = ImmediateSpeechService(); let transport = ManualTransport()
        let document = ListeningDocument(articleID: "long", title: "Long", text: (0..<30).map { "Paragraph number \($0)." }.joined(separator: "\n\n"))
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        for paragraph in 0..<30 {
            player.start(document, paragraph: paragraph)
            await wait { player.state == .playing }
            XCTAssertLessThanOrEqual(player.cachedChunkCount, 16)
        }
        player.start(document, paragraph: 0)
        await wait { player.state == .playing }
        let texts = await service.texts
        XCTAssertEqual(texts.filter { $0 == "Paragraph number 0." }.count, 2)
        player.close()
        XCTAssertEqual(player.cachedChunkCount, 0)
    }

    func testRejectsInvalidTimestampsAndAcceptsMissingWordMarks() throws {
        let request = SpeechRequest(text: "Hello 🌎", voice: SpeechVoice(id: "a", name: "A", language: "en"), configurationID: "v1")
        XCTAssertNoThrow(try SpeechResponse(audio: .simulated, duration: 2, marks: []).validate(for: request))
        for response in [
            SpeechResponse(audio: .simulated, duration: .nan, marks: []),
            SpeechResponse(audio: .encoded(Data(), contentType: "audio/mp3"), duration: 2, marks: []),
            SpeechResponse(audio: .simulated, duration: 2, marks: [SpeechMark(range: NSRange(location: 7, length: 1), start: 0, end: 1)]),
            SpeechResponse(audio: .simulated, duration: 2, marks: [SpeechMark(range: NSRange(location: 0, length: 5), start: 1, end: 3)])
        ] { XCTAssertThrowsError(try response.validate(for: request)) }
    }
}
