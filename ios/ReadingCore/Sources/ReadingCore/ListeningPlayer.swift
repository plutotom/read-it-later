import Foundation
import Observation

@MainActor @Observable public final class ListeningPlayer {
    public enum State: Equatable { case idle, buffering, playing, paused, finished, failed(String) }
    public private(set) var document: ListeningDocument?
    public private(set) var state: State = .idle
    public private(set) var chunkIndex = 0
    public private(set) var chunkTime: TimeInterval = 0
    public private(set) var voice: SpeechVoice
    public private(set) var rate = 1.0
    public private(set) var sleepDeadline: Date?
    public private(set) var sleepAtEnd = false
    public private(set) var wordRange: NSRange?
    public private(set) var cachedChunkCount = 0
    public private(set) var durations: [Int: TimeInterval] = [:]
    public var voices: [SpeechVoice] { service.voices }
    public var isPlaying: Bool { wantsPlayback }
    public var currentChunk: ListeningDocument.Chunk? {
        guard let chunks = document?.chunks, chunks.indices.contains(chunkIndex) else { return nil }
        return chunks[chunkIndex]
    }
    public var elapsed: TimeInterval { (0..<chunkIndex).reduce(0) { $0 + duration(at: $1) } + chunkTime }
    public var total: TimeInterval { (document?.chunks.indices ?? 0..<0).reduce(0) { $0 + duration(at: $1) } }
    public var timelineIsEstimated: Bool { durations.count < (document?.chunks.count ?? 0) }
    public var remaining: TimeInterval { max(0, total - elapsed) / rate }

    @ObservationIgnored private let service: any SpeechService
    @ObservationIgnored private let transport: any SpeechTransport
    @ObservationIgnored private var requests: [Int: Task<Void, Never>] = [:]
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    private var wantsPlayback = false
    @ObservationIgnored private var loaded = false
    @ObservationIgnored private var cache: [SpeechRequest: SpeechResponse] = [:]
    @ObservationIgnored private var recency: [SpeechRequest] = []
    @ObservationIgnored private var activeResponse: SpeechResponse?
    @ObservationIgnored private let automaticallyTick: Bool

    public init(service: any SpeechService = SimulatedSpeechService(), transport: any SpeechTransport = SimulatedSpeechTransport(), automaticallyTick: Bool = true) {
        precondition(!service.voices.isEmpty, "A speech service must offer at least one voice")
        self.service = service; self.transport = transport; self.automaticallyTick = automaticallyTick
        voice = service.voices[0]
    }

    public func start(_ document: ListeningDocument, paragraph: Int? = nil) {
        if self.document != document {
            invalidate()
            self.document = document; chunkIndex = 0; chunkTime = 0; durations = [:]; wordRange = nil
            sleepDeadline = nil; sleepAtEnd = false
        }
        guard !document.chunks.isEmpty else { close(); return }
        if let paragraph, let index = document.firstChunk(inParagraph: paragraph) {
            move(to: index, offset: 0, play: true)
        } else if state == .finished {
            move(to: 0, offset: 0, play: true)
        } else { resume() }
    }

    public func toggle() { wantsPlayback ? pause() : resume() }
    public func resume() {
        guard document != nil else { return }
        if state == .finished { move(to: 0, offset: 0, play: true); return }
        wantsPlayback = true
        if loaded { transport.play(rate: rate); state = .playing } else { state = .buffering }
        schedule(); startTicker()
    }
    public func pause() {
        if loaded { chunkTime = transport.position }
        transport.pause(); wantsPlayback = false
        if state == .playing || state == .buffering { state = .paused }
        updateWord(); startTicker()
    }
    public func close() {
        invalidate(); wantsPlayback = false; document = nil; state = .idle
        chunkIndex = 0; chunkTime = 0; durations = [:]; wordRange = nil
        sleepDeadline = nil; sleepAtEnd = false
        ticker?.cancel(); ticker = nil
        cache.removeAll(); recency.removeAll(); cachedChunkCount = 0
    }
    public func setRate(_ value: Double) {
        guard value.isFinite else { return }
        if loaded { chunkTime = transport.position }
        rate = min(3, max(0.5, value))
        if wantsPlayback && loaded { transport.play(rate: rate) }
    }
    public func setVoice(_ value: SpeechVoice) {
        guard voices.contains(value), voice != value else { return }
        if loaded { chunkTime = transport.position }
        let oldDuration = duration(at: chunkIndex)
        let fraction = oldDuration > 0 ? chunkTime / oldDuration : 0
        let playing = wantsPlayback
        voice = value; durations = [:]
        move(to: chunkIndex, offset: fraction * duration(at: chunkIndex), play: playing)
    }
    /// Seeking intentionally resumes playback, matching the observed reference app.
    public func seek(to time: TimeInterval) {
        guard time.isFinite, let document, !document.chunks.isEmpty else { return }
        var remaining = min(max(0, time), max(0, total - 0.01))
        var index = 0
        while index < document.chunks.count - 1 && remaining >= duration(at: index) {
            remaining -= duration(at: index); index += 1
        }
        move(to: index, offset: remaining, play: true)
    }
    public func skip(_ seconds: TimeInterval) { seek(to: elapsed + seconds) }
    public func setSleep(minutes: Int?) {
        sleepAtEnd = false
        sleepDeadline = minutes.flatMap { $0 > 0 ? Date().addingTimeInterval(Double($0) * 60) : nil }
        startTicker()
    }
    public func setSleepAtEnd() { sleepDeadline = nil; sleepAtEnd = true; startTicker() }

    /// Poll the transport's actual media clock. Public for deterministic adapter tests.
    public func tick(now: Date = Date()) {
        if let deadline = sleepDeadline, now >= deadline {
            sleepDeadline = nil; pause(); return
        }
        guard wantsPlayback, loaded else { return }
        if let failure = transport.failureMessage {
            transport.pause(); wantsPlayback = false; loaded = false; activeResponse = nil
            if let request = request(at: chunkIndex) {
                cache.removeValue(forKey: request); recency.removeAll { $0 == request }; cachedChunkCount = cache.count
            }
            state = .failed(failure); startTicker(); return
        }
        chunkTime = transport.position
        updateWord()
        if chunkTime >= duration(at: chunkIndex) {
            guard let document else { return }
            if chunkIndex + 1 < document.chunks.count {
                transport.pause(); loaded = false; activeResponse = nil
                chunkIndex += 1; chunkTime = 0; wordRange = nil; state = .buffering
                schedule()
            } else {
                transport.pause(); wantsPlayback = false; state = .finished
                sleepDeadline = nil; sleepAtEnd = false; wordRange = nil; startTicker()
            }
        }
    }

    private func duration(at index: Int) -> TimeInterval {
        guard let chunks = document?.chunks, chunks.indices.contains(index) else { return 0 }
        return durations[index] ?? chunks[index].estimatedDuration
    }
    private func request(at index: Int) -> SpeechRequest? {
        guard let chunks = document?.chunks, chunks.indices.contains(index) else { return nil }
        return SpeechRequest(text: chunks[index].text, voice: voice, configurationID: service.configurationID)
    }
    private func invalidate() {
        generation = UUID()
        for task in requests.values { task.cancel() }
        requests.removeAll(); transport.unload(); loaded = false; activeResponse = nil
    }
    private func move(to index: Int, offset: TimeInterval, play: Bool) {
        guard let chunks = document?.chunks, chunks.indices.contains(index) else { return }
        invalidate(); chunkIndex = index; chunkTime = max(0, offset); wordRange = nil
        wantsPlayback = play; state = play ? .buffering : .paused
        schedule(); startTicker()
    }
    private func schedule() {
        guard let document else { return }
        // The selected chunk is always first; at most two upcoming requests follow it.
        for index in chunkIndex..<min(chunkIndex + 3, document.chunks.count) {
            guard let request = request(at: index) else { continue }
            if let response = cache[request] {
                touch(request); durations[index] = response.duration
                if index == chunkIndex && !loaded { load(response) }
                continue
            }
            guard requests[index] == nil else { continue }
            let epoch = generation
            let service = service
            requests[index] = Task { [weak self] in
                do {
                    let response = try await service.generate(request)
                    try Task.checkCancellation()
                    try response.validate(for: request)
                    guard let self, self.generation == epoch else { return }
                    self.requests[index] = nil
                    self.insert(response, for: request)
                    self.durations[index] = response.duration
                    if self.chunkIndex == index && !self.loaded { self.load(response) }
                } catch {
                    guard let self, self.generation == epoch, !Task.isCancelled else { return }
                    self.requests[index] = nil
                    // A lookahead failure is retried when it becomes the selected chunk.
                    if self.chunkIndex == index {
                        self.transport.pause(); self.wantsPlayback = false
                        self.state = .failed(error.localizedDescription); self.startTicker()
                    }
                }
            }
        }
    }
    private func load(_ response: SpeechResponse) {
        do {
            chunkTime = min(chunkTime, max(0, response.duration - 0.01))
            try transport.load(response, at: chunkTime)
            activeResponse = response; loaded = true; updateWord()
            if wantsPlayback { transport.play(rate: rate); state = .playing } else { state = .paused }
        } catch {
            transport.unload(); loaded = false; activeResponse = nil; wantsPlayback = false
            if let request = request(at: chunkIndex) {
                cache.removeValue(forKey: request); recency.removeAll { $0 == request }; cachedChunkCount = cache.count
            }
            state = .failed(error.localizedDescription); startTicker()
        }
    }
    private func updateWord() {
        guard let chunk = currentChunk,
              let mark = activeResponse?.marks.first(where: { chunkTime >= $0.start && chunkTime < $0.end }) else {
            wordRange = nil; return
        }
        wordRange = NSRange(location: chunk.range.location + mark.range.location, length: mark.range.length)
    }
    private func touch(_ request: SpeechRequest) { recency.removeAll { $0 == request }; recency.append(request) }
    private func insert(_ response: SpeechResponse, for request: SpeechRequest) {
        cache[request] = response; touch(request)
        // Session-only LRU cache, bounded by both chunk count and encoded bytes.
        func bytes() -> Int { cache.values.reduce(0) { sum, value in
            if case .encoded(let data, _) = value.audio { return sum + data.count }; return sum
        } }
        while recency.count > 24 || bytes() > 32_000_000 {
            cache.removeValue(forKey: recency.removeFirst())
        }
        cachedChunkCount = cache.count
    }
    private func startTicker() {
        guard wantsPlayback || sleepDeadline != nil else {
            ticker?.cancel(); ticker = nil; return
        }
        guard automaticallyTick, ticker == nil else { return }
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled, let self else { return }
                self.tick()
            }
        }
    }
}
