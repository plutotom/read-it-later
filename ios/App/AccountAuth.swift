import SwiftUI
import Security
import ReadingCore

@MainActor private final class SessionKeychain {
    let service: String
    init(service: String) { self.service = service }
    func load<T: Decodable>(_ type: T.Type, key: String) throws -> T? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: key,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw NativeAuthError.unavailable }
        return try JSONDecoder().decode(type, from: data)
    }
    func save<T: Encodable>(_ value: T, key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: key]
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(value),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let result = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if result == errSecItemNotFound {
            var insert = query; attributes.forEach { insert[$0.key] = $0.value }
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw NativeAuthError.unavailable }
        } else if result != errSecSuccess { throw NativeAuthError.unavailable }
    }
    func remove(_ key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: key]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeAuthError.unavailable }
    }
}

@MainActor @Observable final class AccountAuth {
    private(set) var session: NativeAuthSession?
    private(set) var restoring = true
    var busy = false
    var error: String?
    var offline = false
    var serverAddress: String
    private var generation = UUID()
    private let vault: SessionKeychain
    private let defaults: UserDefaults
    private let isFixture: Bool
    let bypassForReaderTests: Bool
    @ObservationIgnored var onLock: (() -> Void)?

    init() {
        var fixture = false, bypass = false, live = false
        #if DEBUG
        fixture = ProcessInfo.processInfo.arguments.contains("--ui-testing-auth")
        live = ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-live")
        bypass = ProcessInfo.processInfo.arguments.contains("--ui-testing") && !fixture && !live
        #endif
        isFixture = fixture; bypassForReaderTests = bypass
        vault = SessionKeychain(service: fixture || live || bypass ? "com.isaiahproctor.readitlater.auth-tests" : "com.isaiahproctor.readitlater.auth")
        defaults = fixture || live || bypass ? UserDefaults(suiteName: "PaperDriveAuthUITests")! : .standard
        serverAddress = (Bundle.main.object(forInfoDictionaryKey: "PaperDriveAPIBaseURL") as? String) ?? "https://ril.plutotom.com"
        #if DEBUG
        serverAddress = defaults.string(forKey: "auth-server") ?? serverAddress
        if (fixture || live) && ProcessInfo.processInfo.arguments.contains("--reset-ui-test-library") {
            try? vault.remove("active"); try? vault.remove("revocations"); defaults.removePersistentDomain(forName: "PaperDriveAuthUITests")
            if let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
                try? FileManager.default.removeItem(at: root.appendingPathComponent("UITestAuthLibrary"))
            }
        }
        if live { serverAddress = "http://localhost:4115" }
        #endif
        if bypass {
            session = NativeAuthSession(user: NativeAuthUser(id: "reader-fixture", name: "Reader test", email: "reader@example.invalid"), token: "fixture", expiresAt: .distantFuture, server: URL(string: "https://example.invalid")!)
            restoring = false
            try? publishDestination()
        }
    }

    private func api(_ server: URL) -> any NativeAuthAPI {
        #if DEBUG
        if isFixture { return FixtureAuth(server: server) }
        #endif
        return NativeAuthClient(server: server)
    }

    func restore() async {
        guard !bypassForReaderTests else { return }
        let epoch = generation
        defer { if epoch == generation { restoring = false } }
        do {
            if let active = session, active.expiresAt <= Date() {
                onLock?(); session = nil; defaults.set(true, forKey: "auth-signed-out"); try vault.remove("active")
            }
            if !defaults.bool(forKey: "auth-signed-out"), let saved = try vault.load(NativeAuthSession.self, key: "active"), saved.expiresAt > Date() {
                do {
                    let updated = try await api(saved.server).refresh(saved)
                    guard epoch == generation else { return }
                    try vault.save(updated, key: "active"); session = updated; offline = false
                } catch let failure as NativeAuthError where failure == .unauthorized || failure == .invalidResponse {
                    guard epoch == generation else { return }
                    defaults.set(true, forKey: "auth-signed-out"); try vault.remove("active"); onLock?(); session = nil
                } catch {
                    guard epoch == generation else { return }
                    // Cached identity permits offline reading only within its session lifetime.
                    session = saved; offline = true
                }
            }
            if epoch == generation { try publishDestination() }
        } catch { self.error = "Could not securely restore sign-in. Unlock this iPhone and try again." }
        await retryRevocations()
    }

    func signIn(email: String, password: String) async {
        guard !busy else { return }
        generation = UUID(); let epoch = generation
        busy = true; error = nil
        defer { if generation == epoch { busy = false } }
        var admitted: NativeAuthSession?
        do {
            var local = false
            #if DEBUG
            local = true
            #endif
            let server = try NativeAuthServer.normalized(serverAddress, allowLocalhost: local)
            let value = try await api(server).signIn(email: email, password: password)
            admitted = value
            guard epoch == generation else { try? await api(server).signOut(value); return }
            try vault.save(value, key: "active")
            defaults.set(false, forKey: "auth-signed-out")
            #if DEBUG
            defaults.set(server.absoluteString, forKey: "auth-server")
            #endif
            session = value; offline = false
            try publishDestination()
        } catch {
            if let admitted { try? await api(admitted.server).signOut(admitted) }
            guard epoch == generation else { return }
            session = nil; defaults.set(true, forKey: "auth-signed-out"); try? vault.remove("active"); try? ShareInbox.setDestination(nil)
            self.error = error.localizedDescription
        }
    }

    func signOut() async {
        guard let previous = session else { return }
        generation = UUID(); busy = false
        // This local lock survives even a Keychain deletion failure or offline logout.
        defaults.set(true, forKey: "auth-signed-out")
        onLock?(); session = nil; offline = false; error = nil
        try? ShareInbox.setDestination(nil)
        do {
            var pending = try vault.load([NativeAuthSession].self, key: "revocations") ?? []
            if !pending.contains(previous) { pending.append(previous) }
            try vault.save(pending, key: "revocations")
            try vault.remove("active")
        } catch { self.error = "Signed out locally. Reopen the app online to finish securing the server session." }
        await retryRevocations()
    }

    func checkSession() async {
        guard !bypassForReaderTests, !busy, !restoring else { return }
        await restore()
    }

    private func publishDestination() throws {
        let value = session.map { ShareDestination(namespace: $0.namespace, generation: generation.uuidString, expiresAt: $0.expiresAt) }
        try ShareInbox.setDestination(value)
    }

    private func retryRevocations() async {
        guard !bypassForReaderTests else { return }
        guard let pending = try? vault.load([NativeAuthSession].self, key: "revocations") else { return }
        for value in pending {
            do {
                if value.expiresAt > Date() { try await api(value.server).signOut(value) }
                // Re-read after await; another logout may have appended a different account.
                let current = try vault.load([NativeAuthSession].self, key: "revocations") ?? []
                try vault.save(current.filter { $0 != value }, key: "revocations")
            } catch { return }
        }
    }
}

#if DEBUG
private struct FixtureAuth: NativeAuthAPI {
    let server: URL
    func signIn(email: String, password: String) async throws -> NativeAuthSession {
        guard ["alice@example.invalid", "bob@example.invalid"].contains(email), password == "fixture-password-123" else { throw NativeAuthError.invalidCredentials }
        return NativeAuthSession(user: NativeAuthUser(id: email, name: email.hasPrefix("alice") ? "Alice" : "Bob", email: email), token: "fixture-only-token-\(email)", expiresAt: Date().addingTimeInterval(3600), server: server)
    }
    func refresh(_ existing: NativeAuthSession) async throws -> NativeAuthSession {
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-offline") { throw NativeAuthError.unavailable }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-revoked") { throw NativeAuthError.unauthorized }
        return existing
    }
    func signOut(_ existing: NativeAuthSession) async throws {}
}
#endif
