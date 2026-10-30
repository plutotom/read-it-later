import XCTest
@testable import ReadingCore

final class ArticleContextActionsTests: XCTestCase {
    private func article(url: String = "https://example.com/story") -> Article {
        Article(
            id: "article",
            url: url,
            title: "Story",
            text: "",
            note: "",
            isRead: false,
            isFavorite: false,
            createdAt: Date(timeIntervalSince1970: 0),
            error: nil,
            isArchived: false
        )
    }

    func testMenuOrderIsShareCopyLinkDelete() {
        XCTAssertEqual(ArticleContextAction.all(for: article()).map(\.kind), [.share, .copyLink, .delete])
    }

    func testShareUsesOriginalHTTPLink() {
        let share = ArticleContextAction.share
        XCTAssertEqual(share.title, "Share")
        XCTAssertEqual(share.systemImage, "square.and.arrow.up")
        XCTAssertEqual(share.accessibilityLabel, "Share article")
        XCTAssertFalse(share.isDestructive)
        XCTAssertEqual(ArticleContextAction.shareURL(for: article())?.absoluteString, "https://example.com/story")
        XCTAssertEqual(ArticleContextAction.shareURL(for: article(url: "http://example.com/plain"))?.absoluteString, "http://example.com/plain")
    }

    func testShareIsOmittedWhenURLCannotBeOpened() {
        for value in ["", "http:story", "https:///", "https://user:password@example.com", "text://draft"] {
            XCTAssertNil(ArticleContextAction.shareURL(for: article(url: value)))
            XCTAssertEqual(ArticleContextAction.all(for: article(url: value)).map(\.kind), [.delete])
        }
        XCTAssertNil(ArticleContextAction.shareURL(for: article(url: "not a url")))
        XCTAssertNil(ArticleContextAction.shareURL(for: article(url: "ftp://example.com/file")))
        XCTAssertEqual(ArticleContextAction.all(for: article(url: "")).map(\.kind), [.delete])
    }

    func testCopyLinkUsesSavedURLString() {
        let copy = ArticleContextAction.copyLink
        XCTAssertEqual(copy.title, "Copy link")
        XCTAssertEqual(copy.systemImage, "link")
        XCTAssertEqual(copy.accessibilityLabel, "Copy link")
        XCTAssertFalse(copy.isDestructive)
        XCTAssertEqual(ArticleContextAction.copyLinkValue(for: article()), "https://example.com/story")
        XCTAssertEqual(ArticleContextAction.copyLinkValue(for: article(url: "not a url")), "not a url")
    }

    func testDeleteStaysDestructiveAndSeparatedFromShareCopy() {
        XCTAssertEqual(ArticleContextAction.delete.title, "Delete")
        XCTAssertEqual(ArticleContextAction.delete.systemImage, "trash")
        XCTAssertEqual(ArticleContextAction.delete.accessibilityLabel, "Delete article")
        XCTAssertTrue(ArticleContextAction.delete.isDestructive)
        XCTAssertFalse(ArticleContextAction.share.isDestructive)
        XCTAssertFalse(ArticleContextAction.copyLink.isDestructive)
    }

    @MainActor func testSavedArticleExposesShareAndCopyValues() throws {
        let library = try Library()
        let saved = try library.saveURL("https://example.com/context-menu")
        let row = try XCTUnwrap(library.articles().first)
        XCTAssertEqual(ArticleContextAction.all(for: row).map(\.kind), [.share, .copyLink, .delete])
        XCTAssertEqual(ArticleContextAction.shareURL(for: row)?.absoluteString, saved.url)
        XCTAssertEqual(ArticleContextAction.copyLinkValue(for: row), saved.url)
    }
}
