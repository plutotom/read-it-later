import AVFoundation
import ReadingCore

/// One render queue spans chunk boundaries. Network callbacks feed buffers; UI ticks never schedule audio.
@MainActor final class PCMPlaybackTransport: StreamingSpeechTransport {
    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let pitch = AVAudioUnitTimePitch()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    private struct Segment {
        var bytes = Data(); var scheduled = 0; var finished = false
        var skip: Int; var start: Int64?; var end: Int64?
    }
    private var segments: [Int: Segment] = [:]
    private var order: [Int] = []
    private var scheduling = 0
    private var scheduledFrames: Int64 = 0
    private var renderedFrames: Int64 = 0
    private var clockBias: Int64 = 0
    private var epoch = UUID()
    private var playing = false
    private var currentRate = 1.0
    private(set) var failureMessage: String?
    var onRenderChange: (@MainActor () -> Void)?
    init() {
        engine.attach(node); engine.attach(pitch)
        engine.connect(node, to: pitch, format: format)
        engine.connect(pitch, to: engine.mainMixerNode, format: format)
    }
    private var frame: Int64 {
        if let render = node.lastRenderTime, let time = node.playerTime(forNodeTime: render) { return max(renderedFrames, min(scheduledFrames, time.sampleTime - clockBias)) }
        return renderedFrames
    }
    var renderIndex: Int? {
        let time = frame
        for index in order {
            guard let value = segments[index], let start = value.start else { continue }
            if let end = value.end, time >= end { continue }
            if time >= start { return index }
        }
        // Retain the last section until controller observes final completion.
        return order.first(where: { segments[$0]?.start == nil }) ?? order.last
    }
    var position: TimeInterval {
        guard let index = renderIndex, let segment = segments[index], let start = segment.start else { return 0 }
        return Double(max(0, frame - start) + Int64(segment.skip / 2)) / 24000
    }
    var ended: Bool {
        guard let index = order.last, let end = segments[index]?.end else { return false }
        return frame >= end
    }
    var waitingForAudio: Bool { !ended && frame >= scheduledFrames }
    func begin(index: Int, at time: TimeInterval) throws {
        guard segments[index] == nil else { return }
        guard time.isFinite, time >= 0 else { throw SpeechError.invalidResponse }
        segments[index] = Segment(skip: Int(time * 24000) * 2); order.append(index); order.sort()
        try flush()
    }
    func append(_ data: Data, index: Int) throws {
        guard var segment = segments[index], !segment.finished, segment.bytes.count + data.count <= 20_000_000 else { throw SpeechError.invalidResponse }
        segment.bytes.append(data); segments[index] = segment; try flush()
    }
    func finish(index: Int) throws {
        guard var segment = segments[index], !segment.finished, !segment.bytes.isEmpty, segment.bytes.count % 2 == 0 else { throw SpeechError.invalidResponse }
        segment.finished = true
        segment.skip = min(segment.skip, max(0, segment.bytes.count - 2))
        segments[index] = segment; try flush()
    }
    private func flush() throws {
        // Remove elapsed hardware time spent with an empty queue from the media clock.
        if let render = node.lastRenderTime, let time = node.playerTime(forNodeTime: render), time.sampleTime - clockBias > scheduledFrames {
            clockBias = time.sampleTime - scheduledFrames
        }
        while scheduling < order.count {
            let index = order[scheduling]
            guard var segment = segments[index] else { return }
            if segment.bytes.count <= segment.skip && !segment.finished { return }
            if segment.start == nil { segment.start = scheduledFrames; segment.scheduled = segment.skip }
            let available = segment.bytes.count - segment.bytes.count % 2
            // Small buffers support low startup latency and do not require whole-article audio.
            while segment.scheduled < available {
                let length = min(24000, (available - segment.scheduled) / 2)
                guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(length)), let channel = buffer.floatChannelData?[0] else { throw SpeechError.invalidResponse }
                buffer.frameLength = AVAudioFrameCount(length)
                segment.bytes.withUnsafeBytes { raw in
                    for i in 0..<length { channel[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: segment.scheduled + i * 2, as: Int16.self))) / 32768 }
                }
                scheduledFrames += Int64(length); let boundary = scheduledFrames; let token = epoch
                node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                    Task { @MainActor [weak self] in
                        guard let self, self.epoch == token else { return }
                        self.renderedFrames = max(self.renderedFrames, boundary)
                        self.onRenderChange?()
                    }
                }
                segment.scheduled += length * 2
            }
            if segment.finished { segment.end = scheduledFrames; segment.bytes = Data(); scheduling += 1 }
            segments[index] = segment
            if !segment.finished { break }
        }
        if playing { try startEngine() }
    }
    private func startEngine() throws {
        if !engine.isRunning {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.allowAirPlay, .allowBluetoothA2DP])
            try session.setActive(true)
            try engine.start()
        }
        pitch.rate = Float(currentRate)
        if !node.isPlaying { node.play() }
    }
    func play(rate: Double) {
        currentRate = rate; playing = true
        do { try startEngine() } catch { failureMessage = error.localizedDescription }
    }
    func pause() { playing = false; node.pause() }
    func unload() {
        epoch = UUID(); playing = false; node.stop(); engine.stop(); segments = [:]; order = []; scheduling = 0
        renderedFrames = 0; scheduledFrames = 0; clockBias = 0; failureMessage = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func load(_ response: SpeechResponse, at time: TimeInterval) throws {
        guard case .encoded(let data, let type) = response.audio, type == "audio/pcm" else { throw SpeechError.unsupportedAudio }
        unload(); try begin(index: 0, at: time); try append(data, index: 0); try finish(index: 0)
    }
    func seek(to time: TimeInterval) { /* Controller rebuilds the selected section from the cached PCM. */ }
}
