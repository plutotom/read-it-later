import SwiftUI
import ReadingCore

@MainActor @Observable final class SpeechSetup {
    var address: String
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
    private var account: NativeAuthSession?
    private var accountVoices: [SpeechVoice] = []
    private var configuredSession: NativeAuthSession?
    private(set) var usingAccountPreview = false
    var accountMode: Bool { account != nil }
    func updateAccount(_ value: NativeAuthSession) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-sync-live") { return }
        #endif
        guard account == nil || account?.namespace == value.namespace else { return }
        account = value
    }
    init(namespace: String? = nil) {
        var directoryName = "SpeechAudio"
        var storageDefaults = namespace.flatMap { UserDefaults(suiteName: "PaperDriveSpeech." + $0) } ?? .standard
        if let namespace { directoryName += "/" + namespace }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-auth"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-live") {
            directoryName = "SpeechAudioUITests"
            storageDefaults = UserDefaults(suiteName: "PaperDriveStorageUITests")!
            if ProcessInfo.processInfo.arguments.contains("--reset-ui-test-library") {
                storageDefaults.removePersistentDomain(forName: "PaperDriveStorageUITests")
            }
        }
        #endif
        defaults = storageDefaults
        address = storageDefaults.string(forKey: "speech-server") ?? ""
        let selectedLimit = (storageDefaults.object(forKey: "audio-cache-limit") as? Int).flatMap(CacheLimit.init(rawValue:)) ?? .mb200
        cacheLimit = selectedLimit
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent(directoryName, isDirectory: true)
        cache = SpeechDiskCache(directory: root, limit: selectedLimit.bytes)
    }
    func bootstrap(_ player: ListeningPlayer) async {
        controls = SystemPlaybackControls(player: player)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-sync-live") {
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
        if accountMode {
            if let data = defaults.data(forKey: "account-listening-catalog"), let catalog = try? JSONDecoder().decode(AccountListeningCatalog.self, from: data), catalog.enabled {
                accountVoices = catalog.voices.map(\.voice)
                configureAccount(player)
            }
            await connectAccount(player)
            await refreshStats()
            return
        }
        if let base = URL(string: address), (try? SpeechCatalog.validate(base)) != nil,
           let data = defaults.data(forKey: "speech-catalog"), let catalog = try? JSONDecoder().decode(SpeechCatalog.self, from: data), !catalog.voices.isEmpty {
            player.configure(service: BackendSpeechService(base: base, voices: catalog.voices.map(\.voice), cache: cache), transport: PCMPlaybackTransport(), address: address)
            status = "Connected · saved voices available offline"
        }
        await refreshStats()
    }
    func connect(_ player: ListeningPlayer) async {
        if accountMode { await connectAccount(player); return }
        connecting = true; defer { connecting = false }
        do {
            let clean = address.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let base = URL(string: clean) else { throw SpeechError.backend("Enter a valid HTTPS server address.") }
            let catalog = try await SpeechCatalog.fetch(from: base)
            guard !catalog.voices.isEmpty else { throw SpeechError.backend("The server has no configured speech providers yet.") }
            player.configure(service: BackendSpeechService(base: base, voices: catalog.voices.map(\.voice), cache: cache), transport: PCMPlaybackTransport(), address: clean)
            defaults.set(clean, forKey: "speech-server")
            defaults.set(try JSONEncoder().encode(catalog), forKey: "speech-catalog")
            status = "Connected · \(catalog.voices.count) voices available"
        } catch { status = error.localizedDescription }
    }
    func preview(_ player: ListeningPlayer) {
        player.configure(service: SimulatedSpeechService(), transport: SimulatedSpeechTransport())
        configuredSession = nil; usingAccountPreview = true
        defaults.removeObject(forKey: "speech-server"); defaults.removeObject(forKey: "speech-catalog")
        status = "Silent preview enabled"
    }
    private func configureAccount(_ player: ListeningPlayer, expectedIntent: UUID? = nil, defaultVoiceID: String? = nil) {
        guard let account, !accountVoices.isEmpty, expectedIntent == nil || player.intentToken == expectedIntent else { return }
        if configuredSession != account || usingAccountPreview || player.isSilentPreview {
            let preferred = accountVoices.contains(where: { $0.id == player.voice.id }) ? player.voice.id : defaultVoiceID
            player.configure(service: AccountSpeechService(client: AccountListeningClient(account: account), voices: accountVoices, cache: cache), transport: PCMPlaybackTransport(), address: account.server.absoluteString, preferredVoiceID: preferred, expectedIntent: expectedIntent)
            configuredSession = account
        }
        usingAccountPreview = false
    }

    func connectAccount(_ player: ListeningPlayer, expectedIntent: UUID? = nil) async {
        guard let account, !connecting else { return }
        let intent = expectedIntent ?? player.intentToken
        connecting = true; defer { connecting = false }
        do {
            let catalog = try await AccountListeningClient(account: account).catalog()
            guard catalog.enabled, !catalog.voices.isEmpty else {
                status = "Account listening is not enabled on this backend yet. Silent preview is available."
                return
            }
            accountVoices = catalog.voices.map(\.voice)
            defaults.set(try JSONEncoder().encode(catalog), forKey: "account-listening-catalog")
            guard player.intentToken == intent else { return }
            configureAccount(player, expectedIntent: intent, defaultVoiceID: catalog.defaultVoice)
            status = "Connected · \(accountVoices.count) account voices · shared web listening"
        } catch { status = error.localizedDescription }
    }

    func accountDocument(serverID: String, localID: String, text: String, player: ListeningPlayer, expectedIntent: UUID) async throws -> ListeningDocument {
        guard let account else { throw NativeAuthError.unauthorized }
        if accountVoices.isEmpty { await connectAccount(player, expectedIntent: expectedIntent) }
        try Task.checkCancellation()
        guard player.intentToken == expectedIntent else { throw CancellationError() }
        guard !accountVoices.isEmpty else { throw SpeechError.backend(status) }
        configureAccount(player, expectedIntent: expectedIntent)
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ListeningManifests", isDirectory: true).appendingPathComponent(account.namespace, isDirectory: true)
        guard UUID(uuidString: serverID) != nil else { throw SpeechError.invalidResponse }
        let file = folder.appendingPathComponent(serverID + ".json")
        var manifest: AccountListeningManifest
        do {
            manifest = try await AccountListeningClient(account: account).manifest(articleID: serverID)
            guard manifest.text == text else { throw SpeechError.backend("The article changed. Sync your library and try listening again.") }
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try JSONEncoder().encode(manifest).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            // Manifest metadata is bounded separately from the audio cache; losing it only requires a free metadata fetch.
            var files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey])
            files.sort { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
            var bytes = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
            while (files.count > 100 || bytes > 10_000_000), let oldest = files.first {
                bytes -= (try? oldest.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                try? FileManager.default.removeItem(at: oldest); files.removeFirst()
            }
        } catch {
            if let failure = error as? NativeAuthError, failure == .unauthorized { throw error }
            guard let data = try? Data(contentsOf: file), data.count <= 10_000_000,
                  let saved = try? JSONDecoder().decode(AccountListeningManifest.self, from: data),
                  saved.articleId == serverID, saved.text == text else { throw error }
            try saved.validate(); manifest = saved
        }
        try Task.checkCancellation()
        guard player.intentToken == expectedIntent else { throw CancellationError() }
        return try ListeningDocument(manifest: manifest, localArticleID: localID)
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
            if setup.accountMode {
                Button(setup.connecting ? "Loading voices…" : "Reload account voices") { Task { await setup.connect(player) } }.disabled(setup.connecting)
            } else {
            TextField("https://your-speech-server.example", text: $setup.address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("speechServerURL")
            Button(setup.connecting ? "Connecting…" : "Connect speech server") { Task { await setup.connect(player) } }.disabled(setup.connecting)
            }
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
