import XCTest
import GRDB
@testable import ReadingCore

final class ReadingCoreTests: XCTestCase {
    @MainActor func testInboxImportsOtherLinksAfterBadFileAndPreservesDuplicate() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path)
        let existing = try library.saveURL("https://example.com/saved")
        try library.saveContent(id: existing.id, title: "Saved title", text: "Saved offline text")
        try library.saveNote(id: existing.id, text: "Keep this note")
        let bad = root.appendingPathComponent("000-bad.json")
        let duplicate = root.appendingPathComponent("001-duplicate.json")
        let fresh = root.appendingPathComponent("002-new.json")
        try Data("{broken".utf8).write(to: bad)
        try JSONEncoder().encode("https://example.com/saved#section").write(to: duplicate)
        try JSONEncoder().encode("https://example.com/new").write(to: fresh)
        XCTAssertThrowsError(try library.importInbox(at: root))
        XCTAssertEqual(try library.articles().count, 2)
        XCTAssertEqual(try Library(path: path).articles().count, 2)
        XCTAssertTrue(FileManager.default.fileExists(atPath: bad.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: duplicate.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: fresh.path))
        let restored = try library.saveURL(existing.url)
        XCTAssertEqual(restored.note, "Keep this note")
        XCTAssertEqual(restored.text, "Saved offline text")
    }

    func testURLValidation() throws {
        XCTAssertEqual(try ArticleURL.parse(" https://example.com/story?q=1#part ").absoluteString, "https://example.com/story?q=1")
        for input in ["javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com", "https://localhost/a", "http://127.0.0.1", "not a url"] {
            XCTAssertThrowsError(try ArticleURL.parse(input))
        }
        XCTAssertNotEqual(try ArticleURL.parse("https://example.com/?page=1"), try ArticleURL.parse("https://example.com/?page=2"))
    }

    @MainActor func testDuplicateDoesNotEraseNotesOrContent() async throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/story")
        try library.saveNote(id: article.id, text: "Keep this note")
        try library.saveContent(id: article.id, title: "Title", text: "Offline text")
        let duplicate = try library.saveURL("https://example.com/story#section")
        XCTAssertEqual(duplicate.id, article.id)
        XCTAssertEqual(duplicate.note, "Keep this note")
        XCTAssertEqual(duplicate.text, "Offline text")
        XCTAssertEqual(try library.articles().count, 1)
    }

    @MainActor func testPersistenceAndFailurePreservesContent() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("test.sqlite").path
        let first = try Library(path: path)
        let article = try first.saveURL("https://example.com")
        try first.saveContent(id: article.id, title: "Saved", text: "Readable offline")
        try first.saveNote(id: article.id, text: "My note")
        try first.toggleRead(id: article.id)
        try first.toggleFavorite(id: article.id)
        try first.saveError(id: article.id, message: "Offline")
        let second = try Library(path: path)
        let restored = try XCTUnwrap(second.articles().first)
        XCTAssertEqual(restored.text, "Readable offline")
        XCTAssertEqual(restored.note, "My note")
        XCTAssertTrue(restored.isRead)
        XCTAssertTrue(restored.isFavorite)
        let export = try JSONSerialization.jsonObject(with: second.exportJSON()) as? [String: Any]
        XCTAssertEqual((export?["articles"] as? [[String: Any]])?.first?["note"] as? String, "My note")
        try second.delete(id: article.id)
        XCTAssertTrue(try second.articles().isEmpty)
    }

    func testExtractionRemovesPublisherScriptsAndNavigation() throws {
        let content = String(repeating: "A useful sentence for the offline reader. ", count: 5)
        let result = try Extractor.parse(html: "<html><head><title>My article</title></head><body><nav>Unwanted menu</nav><article><h1>Hello</h1><p>\(content)</p><script>malicious()</script></article></body></html>")
        XCTAssertEqual(result.title, "My article")
        XCTAssertTrue(result.text.contains("A useful sentence"))
        XCTAssertFalse(result.text.contains("malicious"))
        XCTAssertFalse(result.text.contains("Unwanted menu"))
    }

    func testEmptyContentFails() {
        XCTAssertThrowsError(try Extractor.parse(html: "<html><body><script>alert(1)</script></body></html>"))
    }

    @MainActor func testHighlightUnicodePersistenceColorsAndDeletion() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("highlights.sqlite").path
        let library = try Library(path: path)
        let article = try library.saveURL("https://example.com/highlight")
        let text = "Before 👨‍👩‍👧‍👦 café. Repeat café."
        try library.saveContent(id: article.id, title: "Unicode", text: text)
        let range = (text as NSString).range(of: "👨‍👩‍👧‍👦 café")
        let highlight = try library.addHighlight(articleId: article.id, content: text, range: range)
        XCTAssertEqual(highlight.text, "👨‍👩‍👧‍👦 café")
        XCTAssertEqual(highlight.range(in: text), range)
        XCTAssertEqual(try library.addHighlight(articleId: article.id, content: text, range: range).id, highlight.id)
        try library.setHighlightColor(id: highlight.id, color: .pink)
        let reopened = try Library(path: path)
        XCTAssertEqual(try reopened.highlights(articleId: article.id).count, 1)
        XCTAssertEqual(try reopened.highlights(articleId: article.id).first?.color, .pink)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let backup = try decoder.decode(LibraryBackup.self, from: reopened.exportJSON())
        XCTAssertEqual(backup.formatVersion, 2)
        XCTAssertEqual(backup.highlights.first?.text, highlight.text)
        try reopened.deleteHighlight(id: highlight.id)
        XCTAssertTrue(try reopened.highlights(articleId: article.id).isEmpty)
    }

    @MainActor func testHighlightRejectsInvalidOrStaleSelectionAndDoesNotMispaint() async throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/anchors")
        let text = "Hello 🌎! Hello again."
        try library.saveContent(id: article.id, title: "Anchors", text: text)
        for range in [NSRange(location: 0, length: 0), NSRange(location: -1, length: 2), NSRange(location: 0, length: Int.max), NSRange(location: 6, length: 1)] {
            XCTAssertThrowsError(try library.addHighlight(articleId: article.id, content: text, range: range))
        }
        let range = (text as NSString).range(of: "Hello", options: .backwards)
        let highlight = try library.addHighlight(articleId: article.id, content: text, range: range)
        XCTAssertEqual(highlight.range(in: text), range)
        try library.saveContent(id: article.id, title: "Changed", text: "Changed " + text)
        XCTAssertNil(highlight.range(in: "Changed " + text))
        XCTAssertThrowsError(try library.addHighlight(articleId: article.id, content: text, range: range))
        XCTAssertEqual(try library.highlights(articleId: article.id).count, 1)
        try library.delete(id: article.id)
        XCTAssertTrue(try library.highlights(articleId: article.id).isEmpty)
    }

    @MainActor func testUpgradeFromVersionOneKeepsLibraryAndNotes() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("v1.sqlite").path
        let legacy = try DatabaseQueue(path: path)
        var oldMigrator = DatabaseMigrator()
        oldMigrator.registerMigration("v1") { db in
            try db.execute(sql: """
                CREATE TABLE article (
                    id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
                    text TEXT NOT NULL, note TEXT NOT NULL, isRead BOOLEAN NOT NULL,
                    isFavorite BOOLEAN NOT NULL, createdAt DATETIME NOT NULL, error TEXT
                );
                INSERT INTO article VALUES ('legacy', 'https://example.com/legacy', 'Old title',
                    'Text kept from version one', 'Important note', 1, 1, '2026-09-06 12:00:00', NULL);
                """)
        }
        try oldMigrator.migrate(legacy)
        let upgraded = try Library(path: path)
        let article = try XCTUnwrap(upgraded.articles().first)
        XCTAssertEqual(article.note, "Important note")
        XCTAssertEqual(article.text, "Text kept from version one")
        XCTAssertTrue(article.isFavorite)
        _ = try upgraded.addHighlight(articleId: article.id, content: article.text, range: NSRange(location: 0, length: 4))
        XCTAssertEqual(try upgraded.highlights(articleId: article.id).count, 1)
    }
}
