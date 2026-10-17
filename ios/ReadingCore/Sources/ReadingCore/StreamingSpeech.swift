import Foundation
import CryptoKit

public struct SpeechDescriptor: Codable, Hashable, Sendable {
    public let provider: String
    public let model: String
    public let voice: String
    public let language: String
    public let normalization: String
    public let synthesisRate: Int
    public init(provider: String, model: String, voice: String, language: String = "en-US", normalization: String, synthesisRate: Int = 1) {
        self.provider = provider; self.model = model; self.voice = voice; self.language = language; self.normalization = normalization; self.synthesisRate = synthesisRate
    }
}
public enum SpeechEvent: Sendable {
    case response(SpeechResponse) // Compatibility for completed/silent adapters.
    case audio(Data)
    case marks([SpeechMark])
    case complete(duration: TimeInterval)
}
@MainActor public protocol StreamingSpeechTransport: SpeechTransport {
    var renderIndex: Int? { get }
    var ended: Bool { get }
    var waitingForAudio: Bool { get }
    var onRenderChange: (@MainActor () -> Void)? { get set }
    func begin(index: Int, at time: TimeInterval) throws
    func append(_ data: Data, index: Int) throws
    func finish(index: Int) throws
}

/// Complete artifacts only. A canceled partial response is never promoted to disk.
public actor SpeechDiskCache {
    struct Entry: Codable { var key: String; var lastUsed: Date; var size: Int }
    struct Stored: Codable { var data: Data; var duration: Double; var marks: [WireMark] }
    public struct Stats: Sendable { public let bytes: Int; public let chunks: Int }
    private let directory: URL
    private let limit: Int
    private let maxAge: TimeInterval
    private var entries: [Entry] = []
    private var loaded = false
    public init(directory: URL, limit: Int = 200_000_000, maxAge: TimeInterval = 28 * 86400) { self.directory = directory; self.limit = limit; self.maxAge = maxAge }
    public static func key(_ request: SpeechRequest) -> String {
        let descriptor = request.voice.descriptor.map { [$0.provider, $0.model, $0.voice, $0.language, $0.normalization, String($0.synthesisRate)].joined(separator: "\u{0}") } ?? request.configurationID + "\u{0}" + request.voice.id
        return SHA256.hash(data: Data((descriptor + "\u{0}" + request.text).utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func prepare(now: Date) throws {
        if !loaded {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            if let data = try? Data(contentsOf: directory.appendingPathComponent("index.json")), let saved = try? JSONDecoder().decode([Entry].self, from: data) { entries = saved }
            loaded = true
            // Recover atomic writes interrupted before the manifest update; do not keep orphans.
            let known = Set(entries.map { $0.key + ".json" } + ["index.json"])
            for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where !known.contains(url.lastPathComponent) { try? FileManager.default.removeItem(at: url) }
        }
        for entry in entries where now.timeIntervalSince(entry.lastUsed) >= maxAge { try? FileManager.default.removeItem(at: file(entry.key)) }
        entries.removeAll { now.timeIntervalSince($0.lastUsed) >= maxAge || !FileManager.default.fileExists(atPath: file($0.key).path) }
        while entries.reduce(0, { $0 + $1.size }) > limit, let oldest = entries.min(by: { $0.lastUsed < $1.lastUsed }) {
            try? FileManager.default.removeItem(at: file(oldest.key)); entries.removeAll { $0.key == oldest.key }
        }
        try persist()
    }
    private func file(_ key: String) -> URL { directory.appendingPathComponent(key + ".json") }
    private func persist() throws { try JSONEncoder().encode(entries).write(to: directory.appendingPathComponent("index.json"), options: .atomic) }
    public func get(_ request: SpeechRequest, now: Date = Date()) throws -> SpeechResponse? {
        try prepare(now: now); let key = Self.key(request)
        guard let index = entries.firstIndex(where: { $0.key == key }) else { return nil }
        do {
            let value = try JSONDecoder().decode(Stored.self, from: Data(contentsOf: file(key)))
            let response = SpeechResponse(audio: .encoded(value.data, contentType: "audio/pcm"), duration: value.duration, marks: value.marks.map(\.mark))
            try response.validate(for: request)
            entries[index].lastUsed = now; try persist(); return response
        } catch { try? FileManager.default.removeItem(at: file(key)); entries.removeAll { $0.key == key }; try persist(); return nil }
    }
    public func put(_ response: SpeechResponse, for request: SpeechRequest, now: Date = Date()) throws {
        try response.validate(for: request)
        guard case .encoded(let bytes, let type) = response.audio, type == "audio/pcm" else { return }
        try prepare(now: now)
        let key = Self.key(request)
        let data = try JSONEncoder().encode(Stored(data: bytes, duration: response.duration, marks: response.marks.map(WireMark.init)))
        guard data.count <= limit else { return }
        try data.write(to: file(key), options: .atomic)
        entries.removeAll { $0.key == key }; entries.append(Entry(key: key, lastUsed: now, size: data.count)); try prepare(now: now)
    }
    public func stats(now: Date = Date()) throws -> Stats { try prepare(now: now); return Stats(bytes: entries.reduce(0) { $0 + $1.size }, chunks: entries.count) }
    public func clear() throws { if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }; entries = []; loaded = false }
}
struct WireMark: Codable, Sendable {
    let offset: Int; let length: Int; let start: Double; let end: Double
    init(_ mark: SpeechMark) { offset = mark.range.location; length = mark.range.length; start = mark.start; end = mark.end }
    var mark: SpeechMark { SpeechMark(range: NSRange(location: offset, length: length), start: start, end: end) }
}

public struct SpeechCatalog: Codable, Sendable {
    public let voices: [CatalogVoice]
    public struct CatalogVoice: Codable, Sendable {
        public let id: String; public let name: String; public let language: String; public let descriptor: SpeechDescriptor
        public var voice: SpeechVoice { SpeechVoice(id: id, name: name, language: language, descriptor: descriptor) }
    }
    public static func fetch(from base: URL) async throws -> SpeechCatalog {
        try validate(base)
        let (data, response) = try await URLSession.shared.data(from: base.appendingPathComponent("api/native/speech/voices"))
        guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 100_000 else { throw SpeechError.invalidResponse }
        return try JSONDecoder().decode(Self.self, from: data)
    }
    public static func validate(_ base: URL) throws {
        var secure = base.scheme == "https"
        #if DEBUG
        if base.scheme == "http", base.host == "localhost" { secure = true }
        #endif
        guard secure, base.host != nil, base.user == nil, base.password == nil, base.query == nil, base.fragment == nil else { throw SpeechError.backend("Use an HTTPS server address without credentials or query parameters.") }
    }
}
public struct BackendSpeechService: SpeechService {
    public let voices: [SpeechVoice]
    public let configurationID = "native-speech-pcm-v1"
    private let base: URL
    private let cache: SpeechDiskCache
    private let session: URLSession
    public init(base: URL, voices: [SpeechVoice], cache: SpeechDiskCache, session: URLSession = .shared) { self.base = base; self.voices = voices; self.cache = cache; self.session = session }
    public func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        var data = Data(), marks: [SpeechMark] = [], duration = 0.0
        for try await event in stream(request) {
            switch event { case .audio(let part): data.append(part); case .marks(let value): marks += value; case .complete(let value): duration = value; case .response(let value): return value }
        }
        return SpeechResponse(audio: .encoded(data, contentType: "audio/pcm"), duration: duration, marks: marks)
    }
    private func readLine(_ iterator: inout URLSession.AsyncBytes.AsyncIterator) async throws -> String? {
        var data = Data()
        while let byte = try await iterator.next() {
            if byte == 10 { break }
            guard data.count < 4_000_000 else { throw SpeechError.invalidResponse }
            data.append(byte)
        }
        if data.isEmpty { return nil }
        if data.last == 13 { data.removeLast() }
        guard let line = String(data: data, encoding: .utf8) else { throw SpeechError.invalidResponse }
        return line
    }
    public func stream(_ request: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    if let saved = try? await cache.get(request) { continuation.yield(.response(saved)); continuation.finish(); return }
                    try SpeechCatalog.validate(base)
                    guard let descriptor = request.voice.descriptor else { throw SpeechError.invalidResponse }
                    struct Input: Encodable { let text: String; let descriptor: SpeechDescriptor }
                    var urlRequest = URLRequest(url: base.appendingPathComponent("api/native/speech/stream")); urlRequest.httpMethod = "POST"; urlRequest.timeoutInterval = 180
                    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type"); urlRequest.httpBody = try JSONEncoder().encode(Input(text: request.text, descriptor: descriptor))
                    var received = Data(), marks: [SpeechMark] = [], started = false, complete = false
                    for _ in 0..<160 {
                        try Task.checkCancellation()
                        let (bytes, response) = try await session.bytes(for: urlRequest)
                        guard let response = response as? HTTPURLResponse else { throw SpeechError.invalidResponse }
                        if response.statusCode == 202 { try await Task.sleep(for: .seconds(1)); continue }
                        guard response.statusCode == 200 else { throw SpeechError.backend("Speech server returned HTTP \(response.statusCode). Check its provider and private storage configuration.") }
                        var iterator = bytes.makeAsyncIterator()
                        while let line = try await readLine(&iterator) {
                            try Task.checkCancellation()
                            guard line.utf8.count <= 4_000_000 else { throw SpeechError.invalidResponse }
                            struct Frame: Decodable { let type: String; let data: String?; let marks: [WireMark]?; let duration: Double?; let message: String?; let encoding: String?; let sampleRate: Int?; let channels: Int?; let descriptor: SpeechDescriptor? }
                            let frame = try JSONDecoder().decode(Frame.self, from: Data(line.utf8))
                            switch frame.type {
                            case "start":
                                guard !started, frame.encoding == "pcm_s16le", frame.sampleRate == 24000, frame.channels == 1, frame.descriptor == descriptor else { throw SpeechError.invalidResponse }; started = true
                            case "audio":
                                guard started, !complete, let raw = frame.data, let part = Data(base64Encoded: raw), received.count + part.count <= 20_000_000 else { throw SpeechError.invalidResponse }
                                received.append(part); continuation.yield(.audio(part))
                            case "marks":
                                guard started, !complete, let value = frame.marks else { throw SpeechError.invalidResponse }; marks += value.map(\.mark)
                                // Validate before exposing ranges to the reader.
                                try SpeechResponse(audio: .simulated, duration: 3600, marks: marks).validate(for: request)
                                continuation.yield(.marks(value.map(\.mark)))
                            case "audioComplete":
                                guard started, !complete, let duration = frame.duration, abs(duration - Double(received.count) / 48000) < 0.001, received.count % 2 == 0 else { throw SpeechError.invalidResponse }
                                let response = SpeechResponse(audio: .encoded(received, contentType: "audio/pcm"), duration: duration, marks: marks)
                                try response.validate(for: request); complete = true
                                continuation.yield(.complete(duration: duration))
                                // Save independently of the backend's archive acknowledgment.
                                try? await cache.put(response, for: request)
                                continuation.finish(); return
                            case "error": throw SpeechError.backend(frame.message ?? "Speech generation failed.")
                            case "archive": break
                            default: throw SpeechError.invalidResponse
                            }
                        }
                        if !complete { throw SpeechError.invalidResponse }
                    }
                    throw SpeechError.backend("Speech is still preparing. Try again shortly.")
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
