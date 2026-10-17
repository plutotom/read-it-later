import Foundation

public struct SpeechVoice: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String
    public let language: String
    public let descriptor: SpeechDescriptor?
    public init(id: String, name: String, language: String, descriptor: SpeechDescriptor? = nil) {
        self.id = id; self.name = name; self.language = language; self.descriptor = descriptor
    }
}

public struct SpeechRequest: Hashable, Sendable {
    public let text: String
    public let voice: SpeechVoice
    /// Must change when provider/model/output settings change, to invalidate cached audio.
    public let configurationID: String
    public init(text: String, voice: SpeechVoice, configurationID: String) {
        self.text = text; self.voice = voice; self.configurationID = configurationID
    }
}

/// Word ranges are relative to SpeechRequest.text, in UTF-16. Time is at 1× speed.
public struct SpeechMark: Equatable, Sendable {
    public let range: NSRange
    public let start: TimeInterval
    public let end: TimeInterval
    public init(range: NSRange, start: TimeInterval, end: TimeInterval) {
        self.range = range; self.start = start; self.end = end
    }
}

public enum SpeechAudio: Equatable, Sendable {
    case encoded(Data, contentType: String)
    case simulated
}

public struct SpeechResponse: Equatable, Sendable {
    public let audio: SpeechAudio
    public let duration: TimeInterval
    public let marks: [SpeechMark]
    public init(audio: SpeechAudio, duration: TimeInterval, marks: [SpeechMark]) {
        self.audio = audio; self.duration = duration; self.marks = marks
    }

    public func validate(for request: SpeechRequest) throws {
        guard duration.isFinite, duration > 0, duration <= 3600 else { throw SpeechError.invalidResponse }
        if case .encoded(let data, let type) = audio {
            guard !data.isEmpty, data.count <= 20_000_000, type.hasPrefix("audio/") else { throw SpeechError.invalidResponse }
        }
        var previousEnd: TimeInterval = 0
        var previousOffset = 0
        for mark in marks {
            guard mark.start.isFinite, mark.end.isFinite, mark.start >= previousEnd,
                  mark.end > mark.start, mark.end <= duration,
                  mark.range.location >= previousOffset, mark.range.length > 0,
                  mark.range.location <= request.text.utf16.count,
                  mark.range.length <= request.text.utf16.count - mark.range.location,
                  let range = Range(mark.range, in: request.text),
                  range.lowerBound.samePosition(in: request.text.unicodeScalars) != nil,
                  range.upperBound.samePosition(in: request.text.unicodeScalars) != nil else { throw SpeechError.invalidResponse }
            previousEnd = mark.end
            previousOffset = NSMaxRange(mark.range)
        }
    }
}

public enum SpeechError: LocalizedError {
    case invalidResponse
    case unsupportedAudio
    case backend(String)
    public var errorDescription: String? {
        switch self {
        case .backend(let message): message
        case .invalidResponse: "The speech service returned an invalid audio response. Try again."
        case .unsupportedAudio: "This preview only supports simulated audio. Connect an audio transport before using a speech service."
        }
    }
}

/// Implement this boundary for the chosen backend. Respect Task cancellation.
/// Never put a speech provider's secret in the iOS app.
public protocol SpeechService: Sendable {
    var voices: [SpeechVoice] { get }
    var configurationID: String { get }
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse
    func stream(_ request: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error>
}

public extension SpeechService {
    func stream(_ request: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do { continuation.yield(.response(try await generate(request))); continuation.finish() }
                catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

public struct SimulatedSpeechService: SpeechService {
    public let voices = [
        SpeechVoice(id: "preview-a", name: "Preview A", language: "en"),
        SpeechVoice(id: "preview-b", name: "Preview B", language: "en"),
        SpeechVoice(id: "preview-c", name: "Preview C", language: "en")
    ]
    public let configurationID = "silent-preview-v1"
    public init() {}
    public func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        try await Task.sleep(for: .milliseconds(350))
        let words = try NSRegularExpression(pattern: #"\S+"#).matches(in: request.text, range: NSRange(location: 0, length: request.text.utf16.count))
        let marks = words.enumerated().map { index, word in
            SpeechMark(range: word.range, start: Double(index) / 2.8, end: Double(index + 1) / 2.8)
        }
        return SpeechResponse(audio: .simulated, duration: max(0.5, Double(words.count) / 2.8), marks: marks)
    }
}

/// A future AVFoundation transport must report actual media time here, not wall time.
/// The controller uses that time for highlights, completion, seeking and rate changes.
@MainActor public protocol SpeechTransport: AnyObject {
    /// Remain at the response duration after natural completion until the next load.
    var position: TimeInterval { get }
    var failureMessage: String? { get }
    func load(_ response: SpeechResponse, at time: TimeInterval) throws
    func play(rate: Double)
    func pause()
    func unload()
    func seek(to time: TimeInterval)
}

public extension SpeechTransport {
    var failureMessage: String? { nil }
}

@MainActor public final class SimulatedSpeechTransport: SpeechTransport {
    private let clock = ContinuousClock()
    private var started: ContinuousClock.Instant?
    private var offset: TimeInterval = 0
    private var duration: TimeInterval = 0
    private var rate = 1.0
    public init() {}
    public var position: TimeInterval {
        guard let started else { return offset }
        let elapsed = started.duration(to: clock.now).components
        return min(duration, offset + (Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18) * rate)
    }
    public func load(_ response: SpeechResponse, at time: TimeInterval) throws {
        guard response.audio == .simulated else { throw SpeechError.unsupportedAudio }
        started = nil; duration = response.duration; offset = min(duration, max(0, time))
    }
    public func play(rate: Double) { offset = position; self.rate = rate; started = clock.now }
    public func pause() { offset = position; started = nil }
    public func unload() { started = nil; offset = 0; duration = 0 }
    public func seek(to time: TimeInterval) { offset = min(duration, max(0, time)); if started != nil { started = clock.now } }
}
