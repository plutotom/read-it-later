import Foundation
import Observation
import OSLog

@MainActor @Observable public final class ListeningPlayer {
    public enum State: Equatable { case idle, buffering, playing, paused, finished, failed(String) }
    public private(set) var document: ListeningDocument?
    public private(set) var state: State = .idle
    public private(set) var intentToken = UUID()
    public private(set) var chunkIndex = 0
    public private(set) var chunkTime: TimeInterval = 0
    public private(set) var voice: SpeechVoice
    public private(set) var rate = 1.0
    public private(set) var sleepDeadline: Date?
    public private(set) var sleepAtEnd = false
    public private(set) var wordRange: NSRange?
    public private(set) var cachedChunkCount = 0
    public private(set) var durations: [Int: TimeInterval] = [:]
    public var isSilentPreview: Bool { voice.descriptor == nil }
    public private(set) var backendAddress = ""
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

    @ObservationIgnored private var service: any SpeechService
    @ObservationIgnored private var transport: any SpeechTransport
    @ObservationIgnored private var requests: [Int: Task<Void, Never>] = [:]
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var lastBookmark = Date.distantPast
    private var wantsPlayback = false
    @ObservationIgnored private var partials: [Int: (data: Data, marks: [SpeechMark])] = [:]
    @ObservationIgnored private var timings: [Int: [SpeechMark]] = [:]
    @ObservationIgnored private var sentBytes: [Int: Int] = [:]
    @ObservationIgnored private var prepared: Set<Int> = []
    @ObservationIgnored private var completed: Set<Int> = []
    @ObservationIgnored private var loaded = false
    @ObservationIgnored private var cache: [SpeechRequest: SpeechResponse] = [:]
    @ObservationIgnored private var recency: [SpeechRequest] = []
    @ObservationIgnored private var activeResponse: SpeechResponse?
    @ObservationIgnored private let automaticallyTick: Bool
    @ObservationIgnored private let bookmarkNamespace: String

    public init(service: any SpeechService = SimulatedSpeechService(), transport: any SpeechTransport = SimulatedSpeechTransport(), automaticallyTick: Bool = true, bookmarkNamespace: String = "") {
        precondition(!service.voices.isEmpty, "A speech service must offer at least one voice")
        self.service = service; self.transport = transport; self.automaticallyTick = automaticallyTick
        self.bookmarkNamespace = bookmarkNamespace
        voice = service.voices[0]
        bindTransport()
    }
    private func bindTransport() {
        (transport as? any StreamingSpeechTransport)?.onRenderChange = { [weak self] in self?.tick() }
    }
    public func configure(service: any SpeechService, transport: any SpeechTransport, address: String = "") {
        guard !service.voices.isEmpty else { return }
        close(); self.service = service; self.transport = transport; voice = service.voices[0]; backendAddress = address; bindTransport()
    }

    public func start(_ document: ListeningDocument, paragraph: Int? = nil) {
        if self.document != document {
            saveBookmark(); invalidate()
            self.document = document; chunkIndex = 0; chunkTime = 0; durations = [:]; wordRange = nil
            sleepDeadline = nil; sleepAtEnd = false
            if paragraph == nil { restoreBookmark(document) }
        }
        guard !document.chunks.isEmpty else { close(); return }
        if let paragraph, let index = document.firstChunk(inParagraph: paragraph) {
            move(to: index, offset: 0, play: true)
        } else if state == .finished {
            move(to: 0, offset: 0, play: true)
        } else { resume() }
    }

    public func toggle() {
        Logger(subsystem: "com.isaiahproctor.readitlater.speech", category: "controls").notice("toggle playing=\(self.wantsPlayback) chunk=\(self.chunkIndex)")
        wantsPlayback ? pause() : resume()
    }
    public func resume() {
        intentToken = UUID()
        Logger(subsystem: "com.isaiahproctor.readitlater.speech", category: "controls").notice("resume chunk=\(self.chunkIndex)")
        guard document != nil else { return }
        if state == .finished { move(to: 0, offset: 0, play: true); return }
        wantsPlayback = true
        if loaded { transport.play(rate: rate); state = .playing } else { state = .buffering }
        schedule(); startTicker()
    }
    public func pause() {
        intentToken = UUID()
        Logger(subsystem: "com.isaiahproctor.readitlater.speech", category: "controls").notice("pause chunk=\(self.chunkIndex)")
        if loaded { chunkTime = transport.position }
        saveBookmark()
        transport.pause(); wantsPlayback = false
        if state == .playing || state == .buffering { state = .paused }
        updateWord(); startTicker()
    }
    public func close() {
        intentToken = UUID()
        saveBookmark(); invalidate(); wantsPlayback = false; document = nil; state = .idle
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
            if let request = request(at: chunkIndex) {
                cache.removeValue(forKey: request); recency.removeAll { $0 == request }; cachedChunkCount = cache.count
            }
            failPlayback(failure); return
        }
        if let stream = transport as? any StreamingSpeechTransport {
            if let index = stream.renderIndex, index != chunkIndex, let chunks = document?.chunks, chunks.indices.contains(index) {
                chunkIndex = index; activeResponse = cache[request(at: index)!]; wordRange = nil; timings = timings.filter { $0.key >= index }; schedule()
            }
            chunkTime = transport.position
            if now.timeIntervalSince(lastBookmark) >= 5 { saveBookmark(); lastBookmark = now }
            state = stream.waitingForAudio ? .buffering : .playing
            updateWord()
            if stream.ended, completed.contains(chunkIndex), chunkIndex == (document?.chunks.count ?? 0) - 1 {
                transport.pause(); wantsPlayback = false; state = .finished; wordRange = nil; sleepDeadline = nil; sleepAtEnd = false; saveBookmark(); startTicker()
            }
            return
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

    private struct Bookmark: Codable { let fingerprint: String; let offset: Int; let rate: Double; let voice: String; let time: Double?; let chunkStart: Int?; let descriptor: SpeechDescriptor?; let configuration: String?; let finished: Bool? }
    private func contentFingerprint(_ text: String) -> String { SpeechDiskCache.key(SpeechRequest(text: text, voice: SpeechVoice(id: "content", name: "", language: ""), configurationID: "bookmark-content-v1")) }
    private func bookmarkKey(_ id: String) -> String { "speech-bookmark-" + (bookmarkNamespace.isEmpty ? "" : bookmarkNamespace + ":") + id }
    private func saveBookmark() {
        guard automaticallyTick else { return }
        guard let document, let chunk = currentChunk else { return }
        let fraction = duration(at: chunkIndex) > 0 ? chunkTime / duration(at: chunkIndex) : 0
        let offset = chunk.range.location + min(max(0, chunk.range.length - 1), Int(Double(chunk.range.length) * min(1, max(0, fraction))))
        let value = Bookmark(fingerprint: contentFingerprint(document.text), offset: offset, rate: rate, voice: voice.id, time: chunkTime, chunkStart: chunk.range.location, descriptor: voice.descriptor, configuration: service.configurationID, finished: state == .finished)
        if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: bookmarkKey(document.articleID)) }
    }
    private func restoreBookmark(_ document: ListeningDocument) {
        guard automaticallyTick else { return }
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey(document.articleID)), let value = try? JSONDecoder().decode(Bookmark.self, from: data) else { return }
        let fingerprint = contentFingerprint(document.text)
        guard fingerprint == value.fingerprint, let index = document.chunk(atUTF16Offset: value.offset) else { return }
        if let savedVoice = voices.first(where: { $0.id == value.voice }) { voice = savedVoice }
        rate = min(3, max(0.5, value.rate)); chunkIndex = index
        if value.finished == true { state = .finished; chunkIndex = 0; chunkTime = 0; return }
        let chunk = document.chunks[index]
        if let time = value.time, time.isFinite, time >= 0, time <= 3600,
           value.chunkStart == chunk.range.location, value.descriptor == voice.descriptor,
           value.configuration == service.configurationID {
            chunkTime = time
        } else { chunkTime = 0 }
    }
    private func failPlayback(_ message: String) {
        intentToken = UUID()
        if loaded { chunkTime = transport.position }
        invalidate(); wantsPlayback = false; state = .failed(message); startTicker()
    }
    private func duration(at index: Int) -> TimeInterval {
        guard let chunks = document?.chunks, chunks.indices.contains(index) else { return 0 }
        return durations[index] ?? chunks[index].estimatedDuration
    }
    private func request(at index: Int) -> SpeechRequest? {
        guard let chunks = document?.chunks, chunks.indices.contains(index) else { return nil }
        let identity: SpeechSegmentIdentity?
        if let articleId = document?.serverArticleID, let revision = document?.serverRevision {
            identity = SpeechSegmentIdentity(articleId: articleId, revision: revision, segment: chunks[index].id)
        } else { identity = nil }
        return SpeechRequest(text: chunks[index].text, voice: voice, configurationID: service.configurationID, segment: identity)
    }
    private func invalidate() {
        generation = UUID()
        for task in requests.values { task.cancel() }
        requests.removeAll(); transport.unload(); loaded = false; activeResponse = nil; partials = [:]; timings = [:]; sentBytes = [:]; prepared = []; completed = []
    }
    private func move(to index: Int, offset: TimeInterval, play: Bool) {
        intentToken = UUID()
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
            // The renderer already owns these validated buffers. Memory-cache eviction must
            // never dispatch another request or append a second copy of queued audio.
            if completed.contains(index), prepared.contains(index) { continue }
            if let response = cache[request] {
                touch(request); durations[index] = response.duration
                if let stream = transport as? any StreamingSpeechTransport, case .encoded(let bytes, let type) = response.audio, type == "audio/pcm" {
                    if !prepared.contains(index) {
                        do { try stream.begin(index: index, at: index == chunkIndex ? chunkTime : 0); prepared.insert(index); try stream.append(bytes, index: index); try stream.finish(index: index); completed.insert(index); timings[index] = response.marks }
                        catch { state = .failed(error.localizedDescription); wantsPlayback = false; return }
                    }
                    if index == chunkIndex { loaded = true; activeResponse = response; if wantsPlayback { transport.play(rate: rate); state = .playing } }
                } else if index == chunkIndex && !loaded { load(response) }
                continue
            }
            guard requests[index] == nil else { continue }
            if let stream = transport as? any StreamingSpeechTransport, !prepared.contains(index) {
                do { try stream.begin(index: index, at: index == chunkIndex ? chunkTime : 0); prepared.insert(index) }
                catch { state = .failed(error.localizedDescription); wantsPlayback = false; return }
            }
            let epoch = generation
            let service = service
            requests[index] = Task { [weak self] in
                do {
                    for try await event in service.stream(request) {
                        try Task.checkCancellation()
                        guard let self, self.generation == epoch else { return }
                        switch event {
                        case .response(let response):
                            try response.validate(for: request)
                            self.insert(response, for: request); self.durations[index] = response.duration
                            if let stream = self.transport as? any StreamingSpeechTransport, case .encoded(let bytes, let type) = response.audio, type == "audio/pcm" {
                                try stream.append(bytes, index: index); try stream.finish(index: index); self.completed.insert(index); self.timings[index] = response.marks
                                if self.chunkIndex == index { self.loaded = true; self.activeResponse = response; if self.wantsPlayback { self.transport.play(rate: self.rate); self.state = .playing } }
                            } else if self.chunkIndex == index && !self.loaded { self.load(response) }
                        case .audio(let bytes):
                            guard let stream = self.transport as? any StreamingSpeechTransport else { throw SpeechError.unsupportedAudio }
                            if !self.prepared.contains(index) { try stream.begin(index: index, at: index == self.chunkIndex ? self.chunkTime : 0); self.prepared.insert(index) }
                            var partial = self.partials[index] ?? (Data(), [])
                            partial.data.append(bytes); self.partials[index] = partial
                            // Only the selected section streams into the render queue before EOF.
                            // Lookahead must validate completely before it can be heard.
                            if index == self.chunkIndex {
                                let sent = self.sentBytes[index] ?? 0
                                try stream.append(partial.data.subdata(in: sent..<partial.data.count), index: index)
                                self.sentBytes[index] = partial.data.count
                            }
                            if index == self.chunkIndex { let starting = !self.loaded; self.loaded = true; if self.wantsPlayback && starting { self.transport.play(rate: self.rate); self.state = .playing } }
                        case .marks(let marks):
                            var partial = self.partials[index] ?? (Data(), [])
                            partial.marks += marks; self.partials[index] = partial
                        case .complete(let duration):
                            guard let stream = self.transport as? any StreamingSpeechTransport, let partial = self.partials[index] else { throw SpeechError.invalidResponse }
                            let response = SpeechResponse(audio: .encoded(partial.data, contentType: "audio/pcm"), duration: duration, marks: partial.marks)
                            try response.validate(for: request); self.insert(response, for: request); self.durations[index] = duration; self.timings[index] = response.marks; self.completed.insert(index)
                            let sent = self.sentBytes[index] ?? 0
                            if sent < partial.data.count { try stream.append(partial.data.subdata(in: sent..<partial.data.count), index: index) }
                            self.sentBytes[index] = partial.data.count
                            try stream.finish(index: index)
                            if self.chunkIndex == index { self.activeResponse = response }; self.partials[index] = nil
                        }
                    }
                    guard let self, self.generation == epoch else { return }; self.requests[index] = nil

                } catch {
                    guard let self, self.generation == epoch, !Task.isCancelled else { return }
                    self.requests[index] = nil
                    // A lookahead failure is retried when it becomes the selected chunk.
                    if self.chunkIndex == index || (self.transport as? any StreamingSpeechTransport)?.renderIndex == index {
                        self.failPlayback(error.localizedDescription)
                    } else { self.partials[index] = nil; self.sentBytes[index] = nil }
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
              let mark = (partials[chunkIndex]?.marks ?? activeResponse?.marks ?? timings[chunkIndex])?.first(where: { chunkTime >= $0.start && chunkTime < $0.end }) else {
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
