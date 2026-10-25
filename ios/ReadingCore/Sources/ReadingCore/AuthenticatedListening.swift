import Foundation
import CryptoKit

public struct AccountListeningManifest: Codable, Sendable {
    public struct Paragraph: Codable, Sendable { public let index: Int; public let start: Int; public let end: Int }
    public struct Segment: Codable, Sendable { public let index: Int; public let paragraph: Int; public let start: Int; public let end: Int; public let text: String }
    public let protocolVersion: Int
    public let articleId: String
    public let title: String
    public let format: String
    public let offsetUnit: String
    public let text: String
    public let contentHash: String
    public let revision: String
    public let paragraphs: [Paragraph]
    public let segments: [Segment]
    public func validate() throws {
        let hash = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
        guard protocolVersion == 1, UUID(uuidString: articleId) != nil, format == "paper-drive-text-v1", offsetUnit == "utf16",
              hash == contentHash, !revision.isEmpty, revision.count <= 64, !segments.isEmpty, segments.count <= 100_000,
              paragraphs.count <= 100_000 else { throw SpeechError.invalidResponse }
        var previous = 0
        for (index, p) in paragraphs.enumerated() {
            guard p.index == index, p.start >= previous, p.end > p.start, p.end <= text.utf16.count else { throw SpeechError.invalidResponse }
            previous = p.end
        }
        previous = 0
        for (index, s) in segments.enumerated() {
            guard s.index == index, paragraphs.indices.contains(s.paragraph), s.start >= previous,
                  s.start >= paragraphs[s.paragraph].start, s.end <= paragraphs[s.paragraph].end,
                  s.end > s.start, let range = Range(NSRange(location: s.start, length: s.end - s.start), in: text),
                  String(text[range]) == s.text else { throw SpeechError.invalidResponse }
            previous = s.end
        }
    }
}

public struct AccountListeningCatalog: Codable, Sendable {
    public struct Voice: Codable, Sendable {
        public let id: String; public let provider: String; public let name: String; public let model: String; public let wordTimings: Bool
        public var voice: SpeechVoice { SpeechVoice(id: id, name: name, language: "en-US", descriptor: SpeechDescriptor(provider: provider, model: model, voice: id, normalization: "server-owned-v1")) }
    }
    public let enabled: Bool
    public let voices: [Voice]
    public let defaultVoice: String?
}

private final class ListeningRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Shared web listening API: only owned article IDs/segments cross this boundary, never arbitrary billable text.
public struct AccountListeningClient: Sendable {
    public let account: NativeAuthSession
    fileprivate let session: URLSession
    public init(account: NativeAuthSession, configuration: URLSessionConfiguration? = nil) {
        self.account = account
        let config = (configuration?.copy() as? URLSessionConfiguration) ?? .ephemeral
        config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCredentialStorage = nil
        config.httpAdditionalHeaders = config.httpAdditionalHeaders?.filter {
            !["cookie", "authorization"].contains(String(describing: $0.key).lowercased())
        }
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 40; config.timeoutIntervalForResource = 180
        session = URLSession(configuration: config, delegate: ListeningRedirectBlocker(), delegateQueue: nil)
    }
    fileprivate func validateAccount() throws {
        guard account.expiresAt > Date() else { throw NativeAuthError.unauthorized }
        var allowLocalhost = false
        #if DEBUG
        allowLocalhost = true
        #endif
        guard let origin = try? NativeAuthServer.normalized(account.server.absoluteString, allowLocalhost: allowLocalhost),
              origin == account.server else { throw NativeAuthError.invalidServer }
        guard (32...2048).contains(account.token.count),
              !account.token.contains(where: { $0.isWhitespace || $0.isNewline }) else { throw NativeAuthError.unauthorized }
    }
    fileprivate func request(_ path: String) throws -> URLRequest {
        try validateAccount()
        var request = URLRequest(url: account.server.appendingPathComponent(path))
        request.httpShouldHandleCookies = false
        request.setValue("Bearer " + account.token, forHTTPHeaderField: "Authorization")
        return request
    }
    private func json(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, response.url == request.url else { throw SpeechError.invalidResponse }
        try Self.check(response.statusCode)
        guard data.count <= 20_000_000 else { throw SpeechError.invalidResponse }
        return data
    }
    public func catalog() async throws -> AccountListeningCatalog {
        try JSONDecoder().decode(AccountListeningCatalog.self, from: await json(request("api/listening/catalog")))
    }
    public func manifest(articleID: String) async throws -> AccountListeningManifest {
        guard UUID(uuidString: articleID) != nil else { throw SpeechError.invalidResponse }
        var request = try request("api/native/listening/document")
        request.url = URL(string: request.url!.absoluteString + "?articleId=" + articleID)
        let result = try JSONDecoder().decode(AccountListeningManifest.self, from: await json(request))
        guard result.articleId.lowercased() == articleID.lowercased() else { throw SpeechError.invalidResponse }
        try result.validate(); return result
    }
    fileprivate static func check(_ status: Int) throws {
        switch status {
        case 200: return
        case 401, 403: throw NativeAuthError.unauthorized
        case 409: throw SpeechError.backend("The article changed. Sync it again before listening.")
        case 429: throw SpeechError.backend("Listening limit reached. Try again later.")
        case 404: throw SpeechError.backend("Account listening is not enabled on this backend yet.")
        default: throw SpeechError.backend("The listening backend is unavailable. Try again.")
        }
    }
}

public struct AccountSpeechService: SpeechService {
    public let voices: [SpeechVoice]
    public let configurationID = "account-listening-pcm24-v1"
    private let client: AccountListeningClient
    private let cache: SpeechDiskCache
    public init(client: AccountListeningClient, voices: [SpeechVoice], cache: SpeechDiskCache) { self.client = client; self.voices = voices; self.cache = cache }
    public func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        var audio = Data(), marks: [SpeechMark] = [], duration: Double = 0
        for try await event in stream(request) {
            switch event { case .audio(let value): audio.append(value); case .marks(let value): marks += value; case .complete(let value): duration = value; case .response(let value): return value }
        }
        return SpeechResponse(audio: .encoded(audio, contentType: "audio/pcm"), duration: duration, marks: marks)
    }
    public func stream(_ speech: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try client.validateAccount()
                    guard let identity = speech.segment,
                          voices.contains(where: { $0.id == speech.voice.id }) else { throw SpeechError.backend("Sync this article before using account listening.") }
                    if let saved = try await cache.get(speech) { continuation.yield(.response(saved)); continuation.finish(); return }
                    let cacheGeneration = await cache.writeGeneration()
                    var request = try client.request("api/listening/stream")
                    request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: ["articleId": identity.articleId, "revision": identity.revision, "segment": identity.segment, "voiceId": speech.voice.id])
                    var audio = Data(), marks: [SpeechMark] = []
                    var started = false
                    let (bytes, response) = try await client.session.bytes(for: request)
                    // Cancel this listener on completion, failure, or consumer cancellation. The
                    // backend's admitted generation continues independently via waitUntil.
                    defer { bytes.task.cancel() }
                    guard let response = response as? HTTPURLResponse, response.url == request.url else { throw SpeechError.invalidResponse }
                    try AccountListeningClient.check(response.statusCode)
                    var line = Data()
                    for try await byte in bytes {
                        try Task.checkCancellation()
                        guard line.count < 12_000_000 else { throw SpeechError.invalidResponse }
                        if byte != 10 { line.append(byte); continue }
                        guard !line.isEmpty else { continue }
                        let event = try JSONDecoder().decode(Frame.self, from: line); line.removeAll(keepingCapacity: true)
                        switch event.type {
                        case "start":
                            guard !started, event.sampleRate == 24000, event.voiceId == speech.voice.id else { throw SpeechError.invalidResponse }
                            started = true
                        case "audio":
                            guard started, let encoded = event.data, let part = Data(base64Encoded: encoded), !part.isEmpty,
                                  part.count <= 8_000_000 - audio.count else { throw SpeechError.invalidResponse }
                            audio.append(part); continuation.yield(.audio(part))
                        case "marks":
                            guard started, let values = event.marks, values.count <= 4000 - marks.count else { throw SpeechError.invalidResponse }
                            var previousTime = marks.last?.end ?? 0
                            var previousOffset = marks.last.map { NSMaxRange($0.range) } ?? 0
                            for mark in values {
                                guard mark.offset >= previousOffset, mark.length > 0, mark.offset <= speech.text.utf16.count,
                                      mark.length <= speech.text.utf16.count - mark.offset,
                                      mark.start.isFinite, mark.end.isFinite, mark.start >= previousTime, mark.end > mark.start, mark.end <= 3600,
                                      let range = Range(NSRange(location: mark.offset, length: mark.length), in: speech.text),
                                      range.lowerBound.samePosition(in: speech.text.unicodeScalars) != nil,
                                      range.upperBound.samePosition(in: speech.text.unicodeScalars) != nil else { throw SpeechError.invalidResponse }
                                previousTime = mark.end; previousOffset = mark.offset + mark.length
                            }
                            let converted = values.map { SpeechMark(range: NSRange(location: $0.offset, length: $0.length), start: $0.start, end: $0.end) }
                            marks += converted; continuation.yield(.marks(converted))
                        case "complete":
                            guard started, let value = event.duration, value.isFinite, value > 0, !audio.isEmpty, audio.count % 2 == 0,
                                  abs(value - Double(audio.count) / 48000) < 0.02 else { throw SpeechError.invalidResponse }
                            let saved = SpeechResponse(audio: .encoded(audio, contentType: "audio/pcm"), duration: value, marks: marks)
                            try saved.validate(for: speech)
                            try await cache.put(saved, for: speech, expectedGeneration: cacheGeneration)
                            continuation.yield(.complete(duration: value))
                            continuation.finish()
                            return
                        case "error": throw SpeechError.backend(event.message ?? "Speech generation failed. Retry this paragraph.")
                        default: throw SpeechError.invalidResponse
                        }
                    }
                    throw SpeechError.invalidResponse // EOF before a validated complete frame.
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

private struct Frame: Decodable {
    struct Mark: Decodable { let offset: Int; let length: Int; let start: Double; let end: Double }
    let type: String
    let sampleRate: Int?
    let voiceId: String?
    let data: String?
    let duration: Double?
    let marks: [Mark]?
    let message: String?
}
