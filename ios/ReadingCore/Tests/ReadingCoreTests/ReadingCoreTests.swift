import XCTest
@testable import ReadingCore

final class ReadingCoreTests: XCTestCase {
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
        let export = try JSONSerialization.jsonObject(with: second.exportJSON()) as? [[String: Any]]
        XCTAssertEqual(export?.first?["note"] as? String, "My note")
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
}
