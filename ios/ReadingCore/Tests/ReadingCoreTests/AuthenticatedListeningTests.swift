import XCTest
@testable import ReadingCore

final class AuthenticatedListeningTests: XCTestCase {
    private func manifest(_ replacements: [String: Any] = [:]) throws -> AccountListeningManifest {
        let text = "Hello 😀.\n\nNext.";
        var object: [String: Any] = ["protocolVersion": 1, "articleId": "00000000-0000-4000-8000-000000000001", "title": "Fixture", "format": "paper-drive-text-v1", "offsetUnit": "utf16", "text": text, "contentHash": Highlight.contentHash(text), "revision": "web-revision", "paragraphs": [["index": 0,"start":0,"end":9],["index":1,"start":11,"end":16]], "segments": [["index":0,"paragraph":0,"start":0,"end":9,"text":"Hello 😀."],["index":1,"paragraph":1,"start":11,"end":16,"text":"Next."]]]
        object.merge(replacements) { _, new in new }
        return try JSONDecoder().decode(AccountListeningManifest.self, from: JSONSerialization.data(withJSONObject: object))
    }
    func testServerManifestKeepsUnicodeOffsetsAndExactProviderSegmentIDs() throws {
        let manifest = try manifest()
        let document = try ListeningDocument(manifest: manifest, localArticleID: "stable-local-id")
        XCTAssertEqual(document.articleID, "stable-local-id")
        XCTAssertEqual(document.serverRevision, "web-revision")
        XCTAssertEqual(document.chunks.map(\.id), [0,1])
        XCTAssertEqual(document.firstChunk(inParagraph: 1), 1)
        XCTAssertEqual(document.chunk(atUTF16Offset: 7), 0)
        XCTAssertEqual((document.text as NSString).substring(with: document.chunks[0].range), "Hello 😀.")
    }
    func testManifestRejectsHashChangesInvalidRangesAndWrongSegmentText() throws {
        XCTAssertThrowsError(try manifest(["contentHash":"wrong"]).validate())
        XCTAssertThrowsError(try manifest(["offsetUnit":"utf8"]).validate())
        XCTAssertThrowsError(try manifest(["segments":[["index":0,"paragraph":0,"start":0,"end":7,"text":"wrong"]]]).validate())
        XCTAssertThrowsError(try manifest(["segments":[["index":0,"paragraph":9,"start":0,"end":9,"text":"Hello 😀."]]]).validate())
    }
    func testExplicitSegmentIdentityDoesNotChangeLegacyRequests() {
        let voice = SpeechVoice(id: "fixture", name: "Fixture", language: "en-US")
        XCTAssertNil(SpeechRequest(text: "Read", voice: voice, configurationID: "legacy").segment)
        let identity = SpeechSegmentIdentity(articleId: "owned-server-id", revision: "version", segment: 7)
        XCTAssertEqual(SpeechRequest(text: "Read", voice: voice, configurationID: "account", segment: identity).segment, identity)
    }
}

/// Real AsyncBytes callbacks, including responses kept open after complete.
private final class ListeningHTTPFixture: @unchecked Sendable {
    enum Ending: Sendable { case finish, disconnect, hold, redirect(URL) }
    let chunks: [Data]
    let ending: Ending
    let responseURL: URL?
    let stopped = XCTestExpectation(description: "response task cancelled")
    private let lock = NSLock()
    private var captured: [URLRequest] = []
    init(chunks: [Data], ending: Ending = .finish, responseURL: URL? = nil) {
        self.chunks = chunks; self.ending = ending; self.responseURL = responseURL
        stopped.assertForOverFulfill = false
    }
    func record(_ request: URLRequest) {
        var capturedRequest = request
        // URLSession may replace the POST body with an InputStream before URLProtocol.
        if capturedRequest.httpBody == nil, let stream = capturedRequest.httpBodyStream {
            stream.open(); defer { stream.close() }
            var body = Data(), buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                body.append(contentsOf: buffer.prefix(count))
            }
            capturedRequest.httpBody = body
        }
        lock.withLock { captured.append(capturedRequest) }
    }
    var requests: [URLRequest] { lock.withLock { captured } }
}

private final class ListeningHTTPFixtures: @unchecked Sendable {
    private let lock = NSLock()
    private var fixtures: [String: ListeningHTTPFixture] = [:]
    func register(_ fixture: ListeningHTTPFixture, host: String) { lock.withLock { fixtures[host] = fixture } }
    func get(_ host: String) -> ListeningHTTPFixture? { lock.withLock { fixtures[host] } }
    func remove(_ host: String) { _ = lock.withLock { fixtures.removeValue(forKey: host) } }
}

private final class ListeningURLProtocol: URLProtocol, @unchecked Sendable {
    static let fixtures = ListeningHTTPFixtures()
    private let lock = NSLock()
    private var cancelled = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let host = request.url?.host, let fixture = Self.fixtures.get(host) else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return
        }
        fixture.record(request)
        if case .redirect(let destination) = fixture.ending, request.url?.host != destination.host {
            let response = HTTPURLResponse(url: request.url!, statusCode: 302, httpVersion: nil, headerFields: ["Location": destination.absoluteString])!
            client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: destination), redirectResponse: response)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let response = HTTPURLResponse(url: fixture.responseURL ?? request.url!, statusCode: 200, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/x-ndjson", "Set-Cookie": "browser=synthetic; Secure; Path=/"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        for chunk in fixture.chunks { client?.urlProtocol(self, didLoad: chunk) }
        switch fixture.ending {
        case .finish, .redirect: client?.urlProtocolDidFinishLoading(self)
        case .hold: break
        case .disconnect:
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.1) { [self] in
                guard !lock.withLock({ cancelled }) else { return }
                client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
            }
        }
    }
    override func stopLoading() {
        lock.withLock { cancelled = true }
        if let host = request.url?.host { Self.fixtures.get(host)?.stopped.fulfill() }
    }
}

@MainActor
extension AuthenticatedListeningTests {
    private var fixtureVoice: SpeechVoice {
        SpeechVoice(id: "google-fixture", name: "Fixture", language: "en-US", descriptor:
            SpeechDescriptor(provider: "google", model: "fixture-pcm24", voice: "google-fixture", normalization: "server-owned-v1"))
    }
    private var fixtureRequest: SpeechRequest {
        SpeechRequest(text: "Hello 😀.", voice: fixtureVoice, configurationID: "account-listening-pcm24-v1",
                      segment: SpeechSegmentIdentity(articleId: "00000000-0000-4000-8000-000000000001", revision: "fixture-revision", segment: 7))
    }
    private var pcm: Data { Data(repeating: 1, count: 4800) }
    private func frame(_ value: [String: Any]) throws -> Data {
        var data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]); data.append(10); return data
    }
    private func start(sampleRate: Int = 24000, voiceID: String = "google-fixture") throws -> Data {
        try frame(["type": "start", "sampleRate": sampleRate, "voiceId": voiceID])
    }
    private func audio() throws -> Data { try frame(["type": "audio", "data": pcm.base64EncodedString()]) }
    private func marks(_ values: [[String: Any]]? = nil) throws -> Data {
        try frame(["type": "marks", "marks": values ?? [["offset": 0, "length": 5, "start": 0, "end": 0.05], ["offset": 6, "length": 2, "start": 0.05, "end": 0.1]]])
    }
    private func complete(duration: Double = 0.1) throws -> Data { try frame(["type": "complete", "duration": duration]) }
    private func wire() throws -> Data { try start() + audio() + marks() + complete() }
    private func client(_ fixture: ListeningHTTPFixture, server: URL? = nil, token: String? = nil,
                        expiresAt: Date = .distantFuture) -> AccountListeningClient {
        let server = server ?? URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid")!
        ListeningURLProtocol.fixtures.register(fixture, host: server.host!)
        addTeardownBlock { ListeningURLProtocol.fixtures.remove(server.host!) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ListeningURLProtocol.self]
        configuration.httpAdditionalHeaders = ["Cookie": "browser=stale", "Authorization": "Bearer stale-config-token"]
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        let cookie = HTTPCookie(properties: [.domain: server.host!, .path: "/", .name: "fixture-browser", .value: "synthetic", .secure: "TRUE"])!
        HTTPCookieStorage.shared.setCookie(cookie)
        addTeardownBlock { HTTPCookieStorage.shared.deleteCookie(cookie) }
        let session = NativeAuthSession(user: NativeAuthUser(id: "fixture-user", name: "Fixture", email: "fixture@example.invalid"),
                                        token: token ?? String(repeating: "s", count: 43) + ".fixture-signature",
                                        expiresAt: expiresAt, server: server)
        return AccountListeningClient(account: session, configuration: configuration)
    }
    private func cache() -> SpeechDiskCache {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return SpeechDiskCache(directory: directory)
    }
    private func service(_ client: AccountListeningClient, cache: SpeechDiskCache? = nil) -> AccountSpeechService {
        AccountSpeechService(client: client, voices: [fixtureVoice], cache: cache ?? self.cache())
    }
    private func expectInvalid(_ chunks: [Data], audioEventsExpected: Int? = nil, file: StaticString = #filePath, line: UInt = #line) async throws {
        let fixture = ListeningHTTPFixture(chunks: chunks), cache = cache()
        var markEvents = 0, completions = 0, audioEvents = 0
        do {
            for try await event in service(client(fixture), cache: cache).stream(fixtureRequest) {
                if case .marks = event { markEvents += 1 }
                if case .complete = event { completions += 1 }
                if case .audio = event { audioEvents += 1 }
            }
            XCTFail("Accepted invalid stream", file: file, line: line)
        } catch {
            guard case SpeechError.invalidResponse = error else { XCTFail("Unexpected error: \(error)", file: file, line: line); return }
        }
        XCTAssertEqual(markEvents, 0, "Invalid mark batches must never reach playback", file: file, line: line)
        XCTAssertEqual(completions, 0, file: file, line: line)
        if let audioEventsExpected { XCTAssertEqual(audioEvents, audioEventsExpected, file: file, line: line) }
        let saved = try await cache.get(fixtureRequest)
        XCTAssertNil(saved, file: file, line: line)
        XCTAssertEqual(fixture.requests.count, 1, file: file, line: line)
    }

    func testCompleteIsTerminalDespiteSubsequentDisconnect() async throws {
        let fixture = ListeningHTTPFixture(chunks: [try wire()], ending: .disconnect)
        let service = service(client(fixture))
        let response = try await service.generate(fixtureRequest)
        XCTAssertEqual(response.audio, .encoded(pcm, contentType: "audio/pcm"))
        XCTAssertEqual(response.duration, 0.1)
        await fulfillment(of: [fixture.stopped], timeout: 2)
        let replay = try await service.generate(fixtureRequest)
        XCTAssertEqual(replay, response)
        XCTAssertEqual(fixture.requests.count, 1)
    }

    func testCompleteIgnoresMalformedOrTruncatedArchiveAndDoesNotWaitForEOF() async throws {
        for suffix in ["{\"type\":\"archive\",", "not-json\n", "{\"type\":\"error\",\"message\":\"archive failed\"}\n"] {
            let fixture = ListeningHTTPFixture(chunks: [try wire() + Data(suffix.utf8)], ending: .hold)
            let client = client(fixture)
            let service = service(client)
            let completed = expectation(description: "complete ends open response")
            let task = Task {
                defer { completed.fulfill() }
                do {
                    let response = try await service.generate(fixtureRequest)
                    XCTAssertEqual(response.audio, .encoded(pcm, contentType: "audio/pcm"))
                } catch { XCTFail("Trailing archive invalidated complete audio: \(error)") }
            }
            await fulfillment(of: [completed], timeout: 2)
            task.cancel()
            await task.value
            await fulfillment(of: [fixture.stopped], timeout: 2)
            let replay = try await service.generate(fixtureRequest)
            XCTAssertEqual(replay.duration, 0.1)
            XCTAssertEqual(fixture.requests.count, 1)
        }
    }

    func testArbitraryNetworkChunksDecodeWebFramesAndReuseCacheWithoutRequests() async throws {
        let bytes = try wire()
        for size in [1, 7, 71, bytes.count] {
            let chunks = stride(from: 0, to: bytes.count, by: size).map { bytes.subdata(in: $0..<min($0 + size, bytes.count)) }
            let fixture = ListeningHTTPFixture(chunks: chunks)
            let client = client(fixture)
            let service = service(client)
            var received = Data(), receivedMarks: [SpeechMark] = [], durations: [Double] = []
            for try await event in service.stream(fixtureRequest) {
                switch event {
                case .audio(let data): received.append(data)
                case .marks(let values): receivedMarks += values
                case .complete(let duration): durations.append(duration)
                case .response: XCTFail("First request unexpectedly used cache")
                }
            }
            XCTAssertEqual(received, pcm)
            XCTAssertEqual(receivedMarks.map(\.range), [NSRange(location: 0, length: 5), NSRange(location: 6, length: 2)])
            XCTAssertEqual(durations, [0.1])
            let replay = try await service.generate(fixtureRequest)
            XCTAssertEqual(replay.audio, .encoded(received, contentType: "audio/pcm"))
            XCTAssertEqual(replay.marks, receivedMarks)
            XCTAssertEqual(fixture.requests.count, 1)
            let request = try XCTUnwrap(fixture.requests.first)
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/listening/stream")
            XCTAssertEqual(request.url?.host, client.account.server.host)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + client.account.token)
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
            XCTAssertEqual(Set(body.keys), ["articleId", "revision", "segment", "voiceId"])
            XCTAssertEqual(body["articleId"] as? String, fixtureRequest.segment?.articleId)
            XCTAssertEqual(body["revision"] as? String, "fixture-revision")
            XCTAssertEqual(body["segment"] as? Int, 7)
            XCTAssertEqual(body["voiceId"] as? String, fixtureVoice.id)
        }
    }

    func testInvalidStartSampleRateAndVoiceAreRejectedBeforeAudio() async throws {
        for start in [try start(sampleRate: 48000), try start(voiceID: "other-voice")] {
            try await expectInvalid([start, try audio(), try complete()], audioEventsExpected: 0)
        }
    }

    func testInvalidMarksIncludingOverflowAndSplitSurrogatesAreRejectedBeforeYield() async throws {
        let bad: [[String: Any]] = [
            ["offset": -1, "length": 1, "start": 0, "end": 0.5],
            ["offset": 1, "length": Int.max, "start": 0, "end": 0.5],
            ["offset": Int.max, "length": Int.max, "start": 0, "end": 0.5],
            ["offset": 7, "length": 1, "start": 0.05, "end": 0.075],
            ["offset": 0, "length": 0, "start": 0, "end": 0.5],
            ["offset": 0, "length": 1, "start": -1, "end": 0.5],
            ["offset": 0, "length": 1, "start": 0.5, "end": 0.5]
        ]
        let valid: [String: Any] = ["offset": 0, "length": 1, "start": 0, "end": 0.025]
        for mark in bad { try await expectInvalid([try start(), try audio(), try marks([valid, mark]), try complete()]) }
        try await expectInvalid([try start(), try audio(), try marks(Array(repeating: valid, count: 4001)), try complete()])
    }

    func testUnterminatedStreamsAndInvalidCompleteNeverEnterCache() async throws {
        try await expectInvalid([try start(), try audio()])
        let completion = try complete()
        try await expectInvalid([try start(), try audio(), Data(completion.dropLast())])
        try await expectInvalid([try start(), try audio(), try complete(duration: 2)])
        try await expectInvalid([try start(), try complete()])
        try await expectInvalid([try audio(), try complete()])
        try await expectInvalid([try start(), try frame(["type": "archive"])])
    }

    func testSignedTokenOnlyGoesToAccountOriginAndCookiesAreNotUsed() async throws {
        let fixture = ListeningHTTPFixture(chunks: [Data("{\"enabled\":true,\"voices\":[],\"defaultVoice\":null}".utf8)])
        let client = client(fixture)
        _ = try await client.catalog()
        _ = try await client.catalog()
        XCTAssertEqual(fixture.requests.count, 2)
        for request in fixture.requests {
            XCTAssertEqual(request.url, client.account.server.appendingPathComponent("api/listening/catalog"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + client.account.token)
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            XCTAssertFalse(request.httpShouldHandleCookies)
        }
        let destination = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid/catalog")!
        let redirected = ListeningHTTPFixture(chunks: fixture.chunks, ending: .redirect(destination))
        let redirectClient = self.client(redirected)
        ListeningURLProtocol.fixtures.register(redirected, host: destination.host!)
        addTeardownBlock { ListeningURLProtocol.fixtures.remove(destination.host!) }
        do { _ = try await redirectClient.catalog(); XCTFail("Followed credential redirect") } catch {}
        XCTAssertEqual(redirected.requests.count, 1)
        XCTAssertEqual(redirected.requests.first?.url?.host, redirectClient.account.server.host)
    }

    func testInvalidOriginsAndStaleTokensCannotUseNetworkOrCachedAudio() async throws {
        let cache = cache()
        try await cache.put(SpeechResponse(audio: .encoded(pcm, contentType: "audio/pcm"), duration: 0.1, marks: []), for: fixtureRequest)
        for server in ["http://example.invalid", "https://user:pass@example.invalid", "https://example.invalid/path", "https://example.invalid?token=x", "https://example.invalid#fragment", "https://EXAMPLE.invalid/"] {
            let fixture = ListeningHTTPFixture(chunks: [])
            let client = client(fixture, server: URL(string: server)!)
            do { _ = try await client.catalog(); XCTFail("Accepted invalid origin") }
            catch { XCTAssertEqual(error as? NativeAuthError, .invalidServer) }
            do { _ = try await service(client, cache: cache).generate(fixtureRequest); XCTFail("Invalid origin reused cache") }
            catch { XCTAssertEqual(error as? NativeAuthError, .invalidServer) }
            XCTAssertTrue(fixture.requests.isEmpty)
        }
        for (token, expiry) in [("too-short", Date.distantFuture), (String(repeating: "s", count: 40) + "\n", .distantFuture), (String(repeating: "s", count: 2049), .distantFuture), (String(repeating: "s", count: 40), .distantPast)] {
            let fixture = ListeningHTTPFixture(chunks: [])
            let client = client(fixture, token: token, expiresAt: expiry)
            do { _ = try await client.catalog(); XCTFail("Sent stale or invalid token") }
            catch { XCTAssertEqual(error as? NativeAuthError, .unauthorized) }
            do { _ = try await service(client, cache: cache).generate(fixtureRequest); XCTFail("Invalid session reused cache") }
            catch { XCTAssertEqual(error as? NativeAuthError, .unauthorized) }
            XCTAssertTrue(fixture.requests.isEmpty)
        }
    }

    func testResponseFromDifferentOriginIsRejected() async throws {
        let fixture = ListeningHTTPFixture(chunks: [try wire()], responseURL: URL(string: "https://other.example.invalid/api/listening/stream")!)
        do { _ = try await service(client(fixture)).generate(fixtureRequest); XCTFail("Accepted response from another origin") }
        catch { guard case SpeechError.invalidResponse = error else { return XCTFail("Unexpected error: \(error)") } }
        XCTAssertEqual(fixture.requests.count, 1)
    }

    func testConsumerCancellationStopsPartialResponseWithoutCaching() async throws {
        let fixture = ListeningHTTPFixture(chunks: [try start(), try audio()], ending: .hold)
        let cache = cache(), service = service(client(fixture), cache: cache)
        let receivedAudio = expectation(description: "partial audio delivered")
        let consumer = Task {
            do {
                for try await event in service.stream(fixtureRequest) {
                    if case .audio = event { receivedAudio.fulfill() }
                    if case .complete = event { XCTFail("Partial audio completed") }
                }
            } catch { /* Cancellation may terminate iteration normally or throw. */ }
        }
        await fulfillment(of: [receivedAudio], timeout: 2)
        consumer.cancel()
        await consumer.value
        await fulfillment(of: [fixture.stopped], timeout: 2)
        let saved = try await cache.get(fixtureRequest)
        XCTAssertNil(saved)
        XCTAssertEqual(fixture.requests.count, 1)
    }

    func testErrorBeforeCompleteFailsWithoutCachingPartialAudio() async throws {
        let fixture = ListeningHTTPFixture(chunks: [try start(), try audio(), try frame(["type": "error", "message": "Synthetic provider failure"])])
        let cache = cache()
        do { _ = try await service(client(fixture), cache: cache).generate(fixtureRequest); XCTFail("Accepted provider failure") }
        catch {
            guard case SpeechError.backend(let message) = error else { return XCTFail("Unexpected error: \(error)") }
            XCTAssertEqual(message, "Synthetic provider failure")
        }
        let saved = try await cache.get(fixtureRequest)
        XCTAssertNil(saved)
    }

    func testNormalizedDebugLocalhostOriginCanUseSyntheticTransport() async throws {
        #if DEBUG
        for origin in ["http://localhost:4114", "http://127.0.0.1:4114"] {
            let fixture = ListeningHTTPFixture(chunks: [Data("{\"enabled\":true,\"voices\":[],\"defaultVoice\":null}".utf8)])
            let client = client(fixture, server: URL(string: origin)!)
            let catalog = try await client.catalog()
            XCTAssertTrue(catalog.enabled)
            XCTAssertEqual(fixture.requests.count, 1)
            XCTAssertEqual(fixture.requests.first?.url?.absoluteString, origin + "/api/listening/catalog")
        }
        #endif
    }
}
