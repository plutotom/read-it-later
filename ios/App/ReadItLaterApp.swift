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
        }
    }
}

@MainActor @Observable final class LibraryModel {
    var articles: [Article] = []
    var error: String?
    var downloading: Set<String> = []
    var available = false
    private var library: Library?
    private var downloadGeneration = UUID()
    var removingDownloads = false
    private let accountNamespace: String

    init(account: NativeAuthSession) {
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
            available = true
            refresh()
        } catch { self.error = error.localizedDescription }
    }

    func deactivate() {
        downloadGeneration = UUID(); downloading.removeAll(); articles = []; available = false; library = nil
    }

    func refresh() {
        do { articles = try library?.articles() ?? [] }
        catch { self.error = error.localizedDescription }
    }

    @discardableResult func add(_ input: String) -> Article? {
        do {
            guard let library else { return nil }
            let article = try library.saveURL(input)
            refresh()
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
        do { try operation(library); refresh(); return true }
        catch { self.error = error.localizedDescription; return false }
    }

    func export() -> Data? {
        do { return try library?.exportJSON() }
        catch { self.error = error.localizedDescription; return nil }
    }

    func highlights(articleId: String) throws -> [Highlight] {
        try library?.highlights(articleId: articleId) ?? []
    }
}
