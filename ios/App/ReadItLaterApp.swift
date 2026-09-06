import SwiftUI
import ReadingCore

@main struct ReadItLaterApp: App {
    @State private var model = LibraryModel()
    var body: some Scene {
        WindowGroup { LibraryView(model: model).tint(.indigo) }
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
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
                let testLibrary = try Library()
                let sample = try testLibrary.saveURL("https://example.com/offline")
                try testLibrary.saveContent(id: sample.id, title: "An offline test article", text: "This text is already stored on this device. Read it without a network connection, add a note, and mark it read. This fixture belongs only to the UI test process.")
                library = testLibrary
                available = true
                refresh()
                return
            }
            #endif
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
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
        guard let library, !downloading.contains(article.id), let url = URL(string: article.url) else { return }
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
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") { return }
        #endif
        do {
            let files = try FileManager.default.contentsOfDirectory(at: ShareInbox.directory(), includingPropertiesForKeys: nil)
            for file in files where file.pathExtension == "json" {
                let input = try JSONDecoder().decode(String.self, from: Data(contentsOf: file))
                guard add(input) != nil else { continue }
                try FileManager.default.removeItem(at: file) // Remove only after durable DB commit.
            }
        } catch { self.error = error.localizedDescription }
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
