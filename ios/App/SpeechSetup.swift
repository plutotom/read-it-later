import SwiftUI
import ReadingCore

@MainActor @Observable final class SpeechSetup {
    var address = UserDefaults.standard.string(forKey: "speech-server") ?? ""
    var status = "Choose an HTTPS speech server to enable audio."
    var connecting = false
    var cacheBytes = 0
    var cacheCount = 0
    private(set) var cacheLimit: CacheLimit
    var storageError: String?
    var changingStorage = false
    private let defaults: UserDefaults
    let cache: SpeechDiskCache
    private var controls: SystemPlaybackControls?
    init() {
        var directoryName = "SpeechAudio"
        var storageDefaults = UserDefaults.standard
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            directoryName = "SpeechAudioUITests"
            storageDefaults = UserDefaults(suiteName: "PaperDriveStorageUITests")!
            if ProcessInfo.processInfo.arguments.contains("--reset-ui-test-library") {
                storageDefaults.removePersistentDomain(forName: "PaperDriveStorageUITests")
            }
        }
        #endif
        defaults = storageDefaults
        let selectedLimit = (storageDefaults.object(forKey: "audio-cache-limit") as? Int).flatMap(CacheLimit.init(rawValue:)) ?? .mb200
        cacheLimit = selectedLimit
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent(directoryName, isDirectory: true)
        cache = SpeechDiskCache(directory: root, limit: selectedLimit.bytes)
    }
    func bootstrap(_ player: ListeningPlayer) async {
        controls = SystemPlaybackControls(player: player)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-storage") {
                try? await cache.clear()
                let request = SpeechRequest(text: "Storage test.", voice: SpeechVoice(id: "storage-test", name: "Test", language: "en"), configurationID: "storage-test")
                let response = SpeechResponse(audio: .encoded(Data(repeating: 0, count: 48000), contentType: "audio/pcm"), duration: 1, marks: [])
                try? await cache.put(response, for: request)
                await refreshStats()
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-server") { address = "http://localhost:4114"; await connect(player); return }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-audio") { player.configure(service: FixtureStreamingSpeech(), transport: PCMPlaybackTransport()) }
            return
        }
        #endif
        if let base = URL(string: address), (try? SpeechCatalog.validate(base)) != nil,
           let data = UserDefaults.standard.data(forKey: "speech-catalog"), let catalog = try? JSONDecoder().decode(SpeechCatalog.self, from: data), !catalog.voices.isEmpty {
            player.configure(service: BackendSpeechService(base: base, voices: catalog.voices.map(\.voice), cache: cache), transport: PCMPlaybackTransport(), address: address)
            status = "Connected · saved voices available offline"
        }
        await refreshStats()
    }
    func connect(_ player: ListeningPlayer) async {
        connecting = true; defer { connecting = false }
        do {
            let clean = address.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let base = URL(string: clean) else { throw SpeechError.backend("Enter a valid HTTPS server address.") }
            let catalog = try await SpeechCatalog.fetch(from: base)
            guard !catalog.voices.isEmpty else { throw SpeechError.backend("The server has no configured speech providers yet.") }
            player.configure(service: BackendSpeechService(base: base, voices: catalog.voices.map(\.voice), cache: cache), transport: PCMPlaybackTransport(), address: clean)
            UserDefaults.standard.set(clean, forKey: "speech-server")
            UserDefaults.standard.set(try JSONEncoder().encode(catalog), forKey: "speech-catalog")
            status = "Connected · \(catalog.voices.count) voices available"
        } catch { status = error.localizedDescription }
    }
    func preview(_ player: ListeningPlayer) {
        player.configure(service: SimulatedSpeechService(), transport: SimulatedSpeechTransport())
        UserDefaults.standard.removeObject(forKey: "speech-server"); UserDefaults.standard.removeObject(forKey: "speech-catalog")
        status = "Silent preview enabled"
    }
    func refreshStats() async {
        do {
            let value = try await cache.stats()
            cacheBytes = value.bytes; cacheCount = value.chunks
        } catch { storageError = error.localizedDescription }
    }
    func setCacheLimit(_ value: CacheLimit) async {
        guard !changingStorage else { return }
        changingStorage = true; storageError = nil
        defer { changingStorage = false }
        do {
            try await cache.setLimit(value.bytes)
            defaults.set(value.rawValue, forKey: "audio-cache-limit")
            cacheLimit = value
            await refreshStats()
        } catch { storageError = error.localizedDescription }
    }
    @discardableResult func clear(_ player: ListeningPlayer) async -> Bool {
        player.close()
        storageError = nil
        do {
            try await cache.clear(); await refreshStats()
            return true
        } catch { storageError = error.localizedDescription; return false }
    }
}

struct SpeechSettings: View {
    @Environment(SpeechSetup.self) private var setup
    @Environment(ListeningPlayer.self) private var player
    var body: some View {
        @Bindable var setup = setup
        Section("Listening") {
            TextField("https://your-speech-server.example", text: $setup.address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("speechServerURL")
            Button(setup.connecting ? "Connecting…" : "Connect speech server") { Task { await setup.connect(player) } }.disabled(setup.connecting)
            Text(setup.status).font(.footnote).foregroundStyle(.secondary)
            Text("Article sections are sent to your server and its selected speech provider when you listen. Saved audio can play offline.").font(.footnote).foregroundStyle(.secondary)
            Button("Use silent preview") { setup.preview(player) }
        }
    }
}

#if DEBUG
/// Exercises the real renderer without a provider account or any paid generation.
private struct FixtureStreamingSpeech: SpeechService {
    let voices = [SpeechVoice(id: "test-pcm", name: "Test audio", language: "en", descriptor: SpeechDescriptor(provider: "fixture", model: "pcm", voice: "tone", normalization: "off"))]
    let configurationID = "test-pcm"
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse { throw SpeechError.unsupportedAudio }
    func stream(_ request: SpeechRequest) -> AsyncThrowingStream<SpeechEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for _ in 0..<40 {
                        try Task.checkCancellation()
                        var bytes = Data(capacity: 12000)
                        for index in 0..<6000 { var value = Int16(sin(Double(index) * 2 * .pi * 220 / 24000) * 300).littleEndian; withUnsafeBytes(of: &value) { bytes.append(contentsOf: $0) } }
                        continuation.yield(.audio(bytes)); try await Task.sleep(for: .milliseconds(20))
                    }
                    continuation.yield(.complete(duration: 10)); continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
#endif
