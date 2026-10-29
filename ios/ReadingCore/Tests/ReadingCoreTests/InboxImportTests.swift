import XCTest
@testable import ReadingCore

final class InboxImportTests: XCTestCase {
    @MainActor func testSharedEssayPersistsAndIsReportedOnlyWhenAQueuedLinkIsConsumed() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path)
        let inboxFile = root.appendingPathComponent("shared-essay.json")
        let address = "https://paulgraham.com/greatwork.html"
        try JSONEncoder().encode(address).write(to: inboxFile)

        var imported: [Article] = []
        try library.importInbox(at: root) { imported.append($0) }
        let article = try XCTUnwrap(imported.first)
        XCTAssertEqual(imported.count, 1)
        XCTAssertEqual(article.url, address)
        XCTAssertEqual(try Library(path: path).articles().first?.id, article.id)
        XCTAssertFalse(FileManager.default.fileExists(atPath: inboxFile.path))

        imported.removeAll()
        try library.importInbox(at: root) { imported.append($0) }
        XCTAssertTrue(imported.isEmpty)

        try library.toggleArchived(id: article.id)
        try library.saveContent(id: article.id, title: "Saved essay", text: "Previously downloaded text.")
        try library.saveNote(id: article.id, text: "Keep my note")
        try library.saveError(id: article.id, message: "Previous download failed")
        try JSONEncoder().encode(address).write(to: inboxFile)
        try library.importInbox(at: root) { imported.append($0) }
        let existing = try XCTUnwrap(imported.first)
        XCTAssertEqual(imported.count, 1)
        XCTAssertEqual(existing.id, article.id)
        XCTAssertTrue(existing.isArchived)
        XCTAssertEqual(existing.text, "Previously downloaded text.")
        XCTAssertEqual(existing.note, "Keep my note")
        XCTAssertNotNil(existing.error)
        XCTAssertEqual(try library.articles().count, 1)
    }
}
