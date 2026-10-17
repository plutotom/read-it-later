import SwiftUI
import ReadingCore

@main struct ReadItLaterApp: App {
    @State private var model = LibraryModel()
    @State private var player = ListeningPlayer()
    @State private var speech = SpeechSetup()
    var body: some Scene {
        WindowGroup { LibraryView(model: model).environment(player).environment(speech).tint(.indigo).task { await speech.bootstrap(player) } }
    }
}

@MainActor @Observable final class LibraryModel {
    var articles: [Article] = []
    var error: String?
    var downloading: Set<String> = []
    var available = false
    private var library: Library?

    init() {
        do {
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
                let testRoot = root.appendingPathComponent("UITestLibrary", isDirectory: true)
                if ProcessInfo.processInfo.arguments.contains("--reset-ui-test-library"), FileManager.default.fileExists(atPath: testRoot.path) {
                    try FileManager.default.removeItem(at: testRoot)
                }
                try FileManager.default.createDirectory(at: testRoot, withIntermediateDirectories: true)
                let testLibrary = try Library(path: testRoot.appendingPathComponent("library.sqlite").path)
                let sample = try testLibrary.saveURL("https://example.com/offline")
                if !sample.isDownloaded {
                    try testLibrary.saveContent(id: sample.id, title: "An offline test article", text: "This text is already stored on this device. Read it without a network connection, add a note, and mark it read. This fixture belongs only to the UI test process.\n\nTap this second paragraph to start the silent listening preview from here. The player can prepare this section without waiting for the whole article.\n\nA final paragraph lets us test jumping, scrubbing, and moving between sections while keeping the original text intact.")
                }
                library = testLibrary
                available = true
                refresh()
                return
            }
            #endif
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            library = try Library(path: root.appendingPathComponent("library.sqlite").path)
            available = true
            refresh()
        } catch { self.error = error.localizedDescription }
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
        guard let library, !article.isDownloaded || article.error != nil,
              !downloading.contains(article.id), let url = URL(string: article.url) else { return }
        downloading.insert(article.id)
        defer { downloading.remove(article.id); refresh() }
        do {
            let result = try await ArticleDownloader.download(url: url)
            try library.saveContent(id: article.id, title: result.title, text: result.text)
        } catch {
            do { try library.saveError(id: article.id, message: error.localizedDescription) }
            catch { self.error = error.localizedDescription }
        }
    }

    func resume() async {
        importInbox()
        // Sequential, bounded requests. Failed pages retry only on an explicit user action.
        for article in articles where !article.isDownloaded && article.error == nil {
            if Task.isCancelled { break }
            await download(article)
        }
    }

    func importInbox() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing"),
           !ProcessInfo.processInfo.arguments.contains("--ui-testing-import-inbox") { return }
        #endif
        do {
            try library?.importInbox(at: ShareInbox.directory())
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
