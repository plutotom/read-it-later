import SwiftUI
import ReadingCore

@main struct ReadItLaterApp: App {
    @State private var auth = AccountAuth()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            Group {
                if auth.restoring { ProgressView("Restoring sign-in…") }
                else if let session = auth.session { AccountReader(session: session, auth: auth).id(session.namespace) }
                else { SignInView(auth: auth) }
            }.tint(.indigo).task { await auth.restore() }
                .onChange(of: phase) { _, value in if value == .active { Task { await auth.checkSession() } } }
        }
    }
}

@MainActor private final class AccountReaderContext {
    let model: LibraryModel
    let player: ListeningPlayer
    let speech: SpeechSetup
    init(session: NativeAuthSession, auth: AccountAuth) {
        model = LibraryModel(account: session)
        player = ListeningPlayer(bookmarkNamespace: session.namespace)
        speech = SpeechSetup(namespace: auth.bypassForReaderTests ? nil : session.namespace)
        speech.updateAccount(session)
        model.onUnauthorized = { [weak auth] in await auth?.checkSession() }
    }
}

private struct AccountReader: View {
    let session: NativeAuthSession
    let auth: AccountAuth
    @State private var context: AccountReaderContext?
    var body: some View {
        Group {
            if let context {
                LibraryView(model: context.model).environment(context.player).environment(context.speech).environment(auth)
            } else { ProgressView("Opening your library…") }
        }.task {
            // Open SQLite once for this account view's lifetime, never during body evaluation.
            guard context == nil else { return }
            let value = AccountReaderContext(session: session, auth: auth)
            context = value
            auth.onLock = { [weak value] in value?.model.deactivate(); value?.player.close() }
            await value.speech.bootstrap(value.player)
        }.onChange(of: session) { _, value in context?.model.updateAccount(value); context?.speech.updateAccount(value) }
    }
}

@MainActor @Observable final class LibraryModel {
    var articles: [Article] = []
    private(set) var noteSearchText: [String: String] = [:]
    var error: String?
    var downloading: Set<String> = []
    var available = false
    private var library: Library?
    private var downloadGeneration = UUID()
    var removingDownloads = false
    private let accountNamespace: String
    private var account: NativeAuthSession
    private var scheduledSync: Task<Void, Never>?
    private var needsSync = false
    private(set) var syncEnabled = false
    private(set) var annotationSyncEnabled = false
    private(set) var contentRevision = 0
    private(set) var syncing = false
    private(set) var pendingChanges = 0
    private(set) var lastSync: Date?
    private(set) var syncError: String?
    var onUnauthorized: (@MainActor () async -> Void)?

    init(account: NativeAuthSession) {
        self.account = account
        accountNamespace = account.namespace
        do {
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-auth"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-live") {
                let testRoot = root.appendingPathComponent("UITestLibrary", isDirectory: true)
                if ProcessInfo.processInfo.arguments.contains("--reset-ui-test-library"), FileManager.default.fileExists(atPath: testRoot.path) {
                    try FileManager.default.removeItem(at: testRoot)
                }
                try FileManager.default.createDirectory(at: testRoot, withIntermediateDirectories: true)
                let testLibrary = try Library(path: testRoot.appendingPathComponent("library.sqlite").path)
                if try testLibrary.articles().isEmpty {
                    let sample = try testLibrary.saveURL("https://example.com/offline")
                    try testLibrary.saveContent(id: sample.id, title: "An offline test article", text: "This text is already stored on this device. Read it without a network connection, add a note, and mark it read. This fixture belongs only to the UI test process.\n\nTap this second paragraph to start the silent listening preview from here. The player can prepare this section without waiting for the whole article.\n\nA final paragraph lets us test jumping, scrubbing, and moving between sections while keeping the original text intact.")
                    if ProcessInfo.processInfo.arguments.contains("--ui-testing-long-article") {
                        let paragraphs = (1...20).map { "Passage \($0). " + String(repeating: "Synthetic reader text keeps the spoken passage far from the current viewport. ", count: 4) }
                        try testLibrary.saveContent(id: sample.id, title: "An offline test article", text: paragraphs.joined(separator: "\n\n"))
                    }
                }
                library = testLibrary
                available = true
                refresh()
                return
            }
            #endif
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            var accountRoot = root
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-auth") || ProcessInfo.processInfo.arguments.contains("--ui-testing-auth-live") {
                accountRoot = root.appendingPathComponent("UITestAuthLibrary", isDirectory: true)
            }
            #endif
            library = try AccountLibrary.open(root: accountRoot, namespace: account.namespace)
            if accountRoot == root, try String(contentsOf: root.appendingPathComponent("legacy-account-owner"), encoding: .utf8) == account.namespace {
                try ShareInbox.adoptLegacy(namespace: account.namespace)
            }
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-auth"), account.user.id == "alice@example.invalid", try library?.articles().isEmpty == true {
                if let item = try library?.saveURL("https://example.com/alice") {
                    try library?.saveContent(id: item.id, title: "Alice’s private article", text: "Synthetic account isolation fixture.")
                }
            }
            #endif
            var enable = true
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing"), !ProcessInfo.processInfo.arguments.contains("--ui-testing-sync-live") { enable = false }
            #endif
            if enable {
                try library?.enableAnnotationSync(session: account)
                syncEnabled = true; annotationSyncEnabled = true
            }
            available = true
            refresh()
        } catch { self.error = error.localizedDescription }
    }

    func deactivate() {
        scheduledSync?.cancel(); scheduledSync = nil
        library?.cancelSync()
        downloadGeneration = UUID(); downloading.removeAll(); articles = []; noteSearchText = [:]; available = false; library = nil
    }

    func refresh() {
        do {
            articles = try library?.articles() ?? []
            noteSearchText = [:]
            if annotationSyncEnabled, let library {
                for article in articles { noteSearchText[article.id] = try library.notes(articleId: article.id).map(\.content).joined(separator: "\n") }
            }
            contentRevision += 1
            if syncEnabled, let state = try library?.syncState() {
                pendingChanges = state.pendingCount; lastSync = state.lastSuccess
            }
        }
        catch { self.error = error.localizedDescription }
    }

    @discardableResult func add(_ input: String) -> Article? {
        do {
            guard let library else { return nil }
            let article = try library.saveURL(input)
            refresh(); scheduleSync()
            return article
        } catch { self.error = error.localizedDescription; return nil }
    }

    func download(_ article: Article) async {
        guard let library, !removingDownloads, !article.isDownloaded || article.error != nil,
              !downloading.contains(article.id), let url = URL(string: article.url) else { return }
        downloading.insert(article.id)
        let generation = downloadGeneration
        defer { downloading.remove(article.id); refresh() }
        do {
            let result = try await ArticleDownloader.download(url: url)
            guard generation == downloadGeneration else { return }
            try library.saveContent(id: article.id, title: result.title, text: result.text)
            scheduleSync()
        } catch {
            guard generation == downloadGeneration else { return }
            do { try library.saveError(id: article.id, message: error.localizedDescription) }
            catch { self.error = error.localizedDescription }
        }
    }

    func resume() async {
        importInbox()
        let generation = downloadGeneration
        // Sequential, bounded requests. Failed pages retry only on an explicit user action.
        for article in articles where !article.isDownloaded && article.error == nil && !article.downloadSuppressed {
            if Task.isCancelled || generation != downloadGeneration { break }
            await download(article)
        }
        await synchronize()
    }

    func removeDownloads() -> Bool {
        downloadGeneration = UUID()
        return mutate { try $0.removeDownloads() }
    }

    func importInbox() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing"),
           !ProcessInfo.processInfo.arguments.contains("--ui-testing-import-inbox") { return }
        #endif
        do {
            try library?.importInbox(at: ShareInbox.directory(namespace: accountNamespace))
        } catch { self.error = error.localizedDescription }
        refresh()
    }

    @discardableResult func mutate(_ operation: (Library) throws -> Void) -> Bool {
        guard let library else { return false }
        do { try operation(library); refresh(); scheduleSync(); return true }
        catch { self.error = error.localizedDescription; return false }
    }

    func updateAccount(_ value: NativeAuthSession) {
        guard value.namespace == accountNamespace else { return }
        account = value
    }

    private func scheduleSync() {
        guard syncEnabled else { return }
        needsSync = true
        scheduledSync?.cancel()
        scheduledSync = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(500)); try Task.checkCancellation() }
            catch { return }
            guard let self else { return }
            self.scheduledSync = nil
            await self.synchronize()
        }
    }

    func synchronize() async {
        guard syncEnabled, let library, available else { return }
        if syncing { needsSync = true; return }
        syncing = true
        defer { syncing = false; refresh() }
        do {
            repeat {
                needsSync = false
                var local = false
                #if DEBUG
                local = true
                #endif
                try await library.sync(session: account, client: NativeLibraryClient(allowLocalhost: local, protocolVersion: annotationSyncEnabled ? 2 : 1))
                guard available else { return }
                syncError = nil
            } while needsSync && !Task.isCancelled
        } catch is CancellationError { }
        catch {
            guard available else { return }
            syncError = (error as? NativeLibraryError)?.errorDescription ?? "Could not sync. Changes remain on this iPhone."
            if let failure = error as? NativeLibraryError, failure == .unauthorized || failure == .invalidSession { await onUnauthorized?() }
        }
    }

    func restoreDownloadedText(_ id: String) async {
        guard let library else { return }
        do {
            let restored = try library.restoreDownloadedText(id: id)
            refresh()
            if !restored { await synchronize() }
        } catch { self.error = error.localizedDescription }
    }

    func serverArticleID(_ id: String) -> String? { try? library?.articleServerID(id) }
    func textSnapshots(_ id: String) -> [NativeLibraryTextSnapshot] { (try? library?.textSnapshots(articleID: id)) ?? [] }
    func canonicalSnapshot(_ id: String) -> NativeLibraryTextSnapshot? { try? library?.canonicalTextSnapshot(articleID: id) }

    func export() -> Data? {
        do { return try library?.exportJSON() }
        catch { self.error = error.localizedDescription; return nil }
    }

    func notes(articleId: String) throws -> [LibraryNote] {
        try library?.notes(articleId: articleId) ?? []
    }

    func highlights(articleId: String) throws -> [Highlight] {
        try library?.highlights(articleId: articleId) ?? []
    }
}
