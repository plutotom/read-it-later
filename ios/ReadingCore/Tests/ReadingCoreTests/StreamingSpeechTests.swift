import XCTest
@testable import ReadingCore

private actor OpenStreamService: SpeechService {
    nonisolated let voices = [SpeechVoice(id: "stream", name: "Stream", language: "en")]
    nonisolated let configurationID = "stream-test"
    var versions: [String: Int] = [:]
    var streams: [String: AsyncThrowingStream<SpeechEvent, any Error>.Continuation] = [:]
    nonisolated func stream(_ request: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error> {
        AsyncThrowingStream { continuation in Task { await self.attach(request.text, continuation) } }
    }
    func attach(_ text: String, _ continuation: AsyncThrowingStream<SpeechEvent, any Error>.Continuation) { streams[text] = continuation; versions[text, default: 0] += 1 }
    func version(_ text: String) -> Int { versions[text] ?? 0 }
    func fail(_ text: String) { streams[text]?.finish(throwing: URLError(.networkConnectionLost)) }
    func count() -> Int { streams.count }
    func send(_ event: SpeechEvent, text: String) { streams[text]?.yield(event) }
    func end() { for value in streams.values { value.finish() }; streams = [:] }
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse { throw SpeechError.unsupportedAudio }
}
@MainActor private final class StreamingTestTransport: StreamingSpeechTransport {
    var renderIndex: Int?
    var position = 0.0
    var ended = false
    var waitingForAudio = false
    var onRenderChange: (@MainActor () -> Void)?
    var received: [Int: Data] = [:]
    var finished: Set<Int> = []
    var playing = false
    func begin(index: Int, at time: TimeInterval) throws { received[index] = Data(); if renderIndex == nil { renderIndex = index; position = time } }
    func append(_ data: Data, index: Int) throws { received[index, default: Data()].append(data) }
    func finish(index: Int) throws { finished.insert(index) }
    func load(_ response: SpeechResponse, at time: TimeInterval) throws {}
    func play(rate: Double) { playing = true }
    func pause() { playing = false }
    func unload() { received = [:]; finished = []; renderIndex = nil; position = 0; ended = false }
    func seek(to time: TimeInterval) { position = time }
}
final class StreamingSpeechTests: XCTestCase {
    @MainActor func testPlaybackBeginsBeforeEOFAndNeverEndsAtEstimatedDuration() async throws {
        let service = OpenStreamService(), transport = StreamingTestTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        let doc = ListeningDocument(articleID: "streaming", title: "Test", text: "A short paragraph.\n\nAnother paragraph.")
        player.start(doc)
        for _ in 0..<100 where await service.count() < 2 { try await Task.sleep(for: .milliseconds(2)) }
        await service.send(.audio(Data(repeating: 0, count: 48000)), text: "A short paragraph.")
        for _ in 0..<100 where !transport.playing { try await Task.sleep(for: .milliseconds(2)) }
        XCTAssertEqual(player.state, .playing)
        XCTAssertFalse(transport.finished.contains(0))
        transport.position = 999; transport.waitingForAudio = true; player.tick()
        XCTAssertEqual(player.chunkIndex, 0); XCTAssertEqual(player.state, .buffering)
        await service.send(.complete(duration: 1), text: "A short paragraph.")
        await service.send(.audio(Data(repeating: 0, count: 48000)), text: "Another paragraph.")
        await service.send(.complete(duration: 1), text: "Another paragraph.")
        for _ in 0..<100 where transport.finished.count < 2 { try await Task.sleep(for: .milliseconds(2)) }
        XCTAssertEqual(transport.finished, [0, 1])
        transport.renderIndex = 1; transport.position = 0.5; transport.waitingForAudio = false; player.tick()
        XCTAssertEqual(player.chunkIndex, 1); XCTAssertEqual(player.state, .playing)
        transport.position = 1; transport.ended = true; player.tick()
        XCTAssertEqual(player.state, .finished)
        player.close(); await service.end()
    }
    func testPersistentCacheExpiryLRUAndIdentity() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = SpeechDiskCache(directory: root, limit: 1600, maxAge: 100)
        let descriptor = SpeechDescriptor(provider: "inworld", model: "test", voice: "Dennis", normalization: "off")
        let voice = SpeechVoice(id: "v", name: "Voice", language: "en", descriptor: descriptor)
        let a = SpeechRequest(text: "First.", voice: voice, configurationID: "catalog-1")
        let b = SpeechRequest(text: "Second.", voice: voice, configurationID: "catalog-1")
        let c = SpeechRequest(text: "Third.", voice: voice, configurationID: "catalog-1")
        let response = SpeechResponse(audio: .encoded(Data(repeating: 0, count: 480), contentType: "audio/pcm"), duration: 0.01, marks: [])
        let now = Date()
        try await cache.put(response, for: a, now: now)
        try await cache.put(response, for: b, now: now.addingTimeInterval(1))
        let read = try await cache.get(a, now: now.addingTimeInterval(2)); XCTAssertEqual(read, response)
        try await cache.put(response, for: c, now: now.addingTimeInterval(3))
        let evicted = try await cache.get(b, now: now.addingTimeInterval(4)); XCTAssertNil(evicted)
        let reopened = SpeechDiskCache(directory: root, limit: 1600, maxAge: 100)
        let saved = try await reopened.get(a, now: now.addingTimeInterval(5)); XCTAssertEqual(saved, response)
        let sameSynthesis = SpeechRequest(text: a.text, voice: voice, configurationID: "catalog-2")
        XCTAssertEqual(SpeechDiskCache.key(a), SpeechDiskCache.key(sameSynthesis))
        let expired = try await reopened.get(a, now: now.addingTimeInterval(106)); XCTAssertNil(expired)
        let stats = try await reopened.stats(now: now.addingTimeInterval(106)); XCTAssertEqual(stats.bytes, 0)
        try await reopened.clear()
    }
}

extension StreamingSpeechTests {
    @MainActor func testPauseRemainsPausedWhileLookaheadAndRenderCallbacksArrive() async throws {
        let service = OpenStreamService(), transport = StreamingTestTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        let doc = ListeningDocument(articleID: "pause", title: "", text: "First.\n\nSecond.")
        player.start(doc)
        for _ in 0..<100 where await service.count() < 2 { try await Task.sleep(for: .milliseconds(2)) }
        await service.send(.audio(Data(repeating: 0, count: 48000)), text: "First.")
        for _ in 0..<100 where !transport.playing { try await Task.sleep(for: .milliseconds(2)) }
        player.pause()
        await service.send(.complete(duration: 1), text: "First.")
        await service.send(.audio(Data(repeating: 0, count: 48000)), text: "Second.")
        await service.send(.complete(duration: 1), text: "Second.")
        for _ in 0..<100 where transport.finished.count < 2 { try await Task.sleep(for: .milliseconds(2)) }
        transport.onRenderChange?(); player.tick()
        XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.state, .paused); XCTAssertFalse(transport.playing)
        player.close(); await service.end()
    }
}

private final class SpeechURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "speech.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let descriptor = SpeechDescriptor(provider: "speechify", model: "simba-3.2", voice: "geffen_32", normalization: "provider")
        struct Start: Encodable { let type = "start"; let id = "fixture"; let descriptor: SpeechDescriptor; let sampleRate = 24000; let channels = 1; let encoding = "pcm_s16le" }
        let start = try! JSONEncoder().encode(Start(descriptor: descriptor))
        let audio = Data(repeating: 0, count: 48000).base64EncodedString()
        let wire = String(data: start, encoding: .utf8)! + "\n{\"type\":\"audio\",\"data\":\"\(audio)\"}\n{\"type\":\"marks\",\"marks\":[{\"offset\":0,\"length\":5,\"start\":0,\"end\":0.5}]}\n{\"type\":\"audioComplete\",\"duration\":1}\n"
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/x-ndjson"])!, cacheStoragePolicy: .notAllowed)
        let bytes = Data(wire.utf8)
        for offset in stride(from: 0, to: bytes.count, by: 71) { client?.urlProtocol(self, didLoad: bytes.subdata(in: offset..<min(offset + 71, bytes.count))) }
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
extension StreamingSpeechTests {
    func testBackendWireDecodingPersistsCompleteAudioForOfflineReplay() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = SpeechDiskCache(directory: root)
        let descriptor = SpeechDescriptor(provider: "speechify", model: "simba-3.2", voice: "geffen_32", normalization: "provider")
        let voice = SpeechVoice(id: "s", name: "Speech", language: "en-US", descriptor: descriptor)
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [SpeechURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let service = BackendSpeechService(base: URL(string: "https://speech.invalid")!, voices: [voice], cache: cache, session: session)
        let request = SpeechRequest(text: "Hello world", voice: voice, configurationID: "wire")
        let response = try await service.generate(request)
        XCTAssertEqual(response.duration, 1); XCTAssertEqual(response.marks.count, 1)
        session.invalidateAndCancel()
        let offline = try await service.generate(request)
        XCTAssertEqual(response, offline)
    }
}

extension StreamingSpeechTests {
    @MainActor func testPartialFailureResetsRendererBeforeRetryAndNeverQueuesFailedLookahead() async throws {
        let service = OpenStreamService(), transport = StreamingTestTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        let doc = ListeningDocument(articleID: "recovery", title: "", text: "First.\n\nSecond.")
        player.start(doc)
        for _ in 0..<100 where await service.count() < 2 { try await Task.sleep(for: .milliseconds(2)) }
        await service.send(.audio(Data(repeating: 1, count: 24000)), text: "Second.")
        await service.fail("Second.")
        await service.send(.audio(Data(repeating: 0, count: 24000)), text: "First.")
        for _ in 0..<100 where !transport.playing { try await Task.sleep(for: .milliseconds(2)) }
        XCTAssertEqual(transport.received[1]?.count, 0)
        await service.fail("First.")
        for _ in 0..<100 { if case .failed = player.state { break }; try await Task.sleep(for: .milliseconds(2)) }
        guard case .failed = player.state else { XCTFail("Expected an explicit failure"); return }
        XCTAssertFalse(player.isPlaying)
        XCTAssertTrue(transport.received.isEmpty)
        player.resume()
        for _ in 0..<100 where await service.version("First.") < 2 { try await Task.sleep(for: .milliseconds(2)) }
        await service.send(.audio(Data(repeating: 0, count: 48000)), text: "First.")
        await service.send(.complete(duration: 1), text: "First.")
        for _ in 0..<100 where !transport.finished.contains(0) { try await Task.sleep(for: .milliseconds(2)) }
        XCTAssertEqual(player.state, .playing)
        XCTAssertEqual(transport.received[0]?.count, 48000)
        player.close(); await service.end()
    }
}

extension StreamingSpeechTests {
    @MainActor func testRetiredArticleFailureCannotCancelNewMetadataPreparation() async throws {
        let service = OpenStreamService(), transport = StreamingTestTransport()
        let player = ListeningPlayer(service: service, transport: transport, automaticallyTick: false)
        let a = ListeningDocument(articleID: "old", title: "Old", text: "Old request.")
        let b = ListeningDocument(articleID: "new", title: "New", text: "New request.")
        player.start(a)
        for _ in 0..<100 where await service.count() == 0 { try await Task.sleep(for: .milliseconds(2)) }
        let pending = player.beginPreparation()
        await service.fail("Old request.")
        for _ in 0..<30 { await Task.yield() }
        XCTAssertEqual(player.intentToken, pending)
        player.start(b, expectedIntent: pending)
        for _ in 0..<100 where await service.version("New request.") == 0 { try await Task.sleep(for: .milliseconds(2)) }
        XCTAssertEqual(player.document?.articleID, "new")
        let dispatched = await service.version("New request.")
        XCTAssertEqual(dispatched, 1)
        player.close(); await service.end()
    }
}
