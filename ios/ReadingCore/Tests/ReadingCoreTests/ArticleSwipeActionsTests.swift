import XCTest
@testable import ReadingCore

final class ArticleSwipeActionsTests: XCTestCase {
    private func article(read: Bool = false, favorite: Bool = false, archived: Bool = false) -> Article {
        Article(
            id: "article",
            url: "https://example.com/story",
            title: "Story",
            text: "",
            note: "",
            isRead: read,
            isFavorite: favorite,
            createdAt: Date(timeIntervalSince1970: 0),
            error: nil,
            isArchived: archived
        )
    }

    func testEdgesSplitFourActionsWithFullSwipeFirst() {
        let actions = ArticleSwipeAction.all(for: article())
        XCTAssertEqual(actions.map(\.kind), [.read, .favorite, .archive, .delete])
        XCTAssertEqual(ArticleSwipeAction.leading(for: article()).map(\.kind), [.read, .favorite])
        XCTAssertEqual(ArticleSwipeAction.trailing(for: article()).map(\.kind), [.archive, .delete])
        XCTAssertEqual(ArticleSwipeAction.leading(for: article()).first?.kind, .read)
        XCTAssertEqual(ArticleSwipeAction.trailing(for: article()).first?.kind, .archive)
    }

    func testReadToggleUpdatesLabelIconAndAccessibility() {
        let unread = ArticleSwipeAction.read(for: article())
        XCTAssertEqual(unread.title, "Mark read")
        XCTAssertEqual(unread.systemImage, "checkmark.circle")
        XCTAssertEqual(unread.accessibilityLabel, "Mark as read")
        XCTAssertEqual(unread.tint, .blue)

        let read = ArticleSwipeAction.read(for: article(read: true))
        XCTAssertEqual(read.title, "Mark unread")
        XCTAssertEqual(read.systemImage, "envelope.badge")
        XCTAssertEqual(read.accessibilityLabel, "Mark as unread")
    }

    func testFavoriteToggleUpdatesLabelIconAndAccessibility() {
        let add = ArticleSwipeAction.favorite(for: article())
        XCTAssertEqual(add.title, "Favorite")
        XCTAssertEqual(add.systemImage, "star")
        XCTAssertEqual(add.accessibilityLabel, "Add to favorites")
        XCTAssertEqual(add.tint, .orange)

        let remove = ArticleSwipeAction.favorite(for: article(favorite: true))
        XCTAssertEqual(remove.title, "Remove favorite")
        XCTAssertEqual(remove.systemImage, "star.fill")
        XCTAssertEqual(remove.accessibilityLabel, "Remove from favorites")
    }

    func testArchiveToggleUpdatesLabelIconAndAccessibility() {
        let archive = ArticleSwipeAction.archive(for: article())
        XCTAssertEqual(archive.title, "Archive")
        XCTAssertEqual(archive.systemImage, "archivebox")
        XCTAssertEqual(archive.accessibilityLabel, "Archive")
        XCTAssertEqual(archive.tint, .gray)

        let inbox = ArticleSwipeAction.archive(for: article(archived: true))
        XCTAssertEqual(inbox.title, "Move to Inbox")
        XCTAssertEqual(inbox.systemImage, "tray")
        XCTAssertEqual(inbox.accessibilityLabel, "Move to Inbox")
    }

    func testDeleteStaysDestructiveWithAccessibilityLabel() {
        XCTAssertEqual(ArticleSwipeAction.delete.title, "Delete")
        XCTAssertEqual(ArticleSwipeAction.delete.systemImage, "trash")
        XCTAssertEqual(ArticleSwipeAction.delete.accessibilityLabel, "Delete article")
        XCTAssertEqual(ArticleSwipeAction.delete.tint, .red)
        XCTAssertTrue(ArticleSwipeAction.delete.isDestructive)
        XCTAssertFalse(ArticleSwipeAction.read(for: article()).isDestructive)
        XCTAssertFalse(ArticleSwipeAction.archive(for: article()).isDestructive)
    }

    func testLibraryFiltersHideArchivedAndHonorReadFavoriteToggles() {
        var row = article()
        XCTAssertTrue(ArticleLibraryFilter.all.includes(row))
        XCTAssertTrue(ArticleLibraryFilter.unread.includes(row))
        XCTAssertFalse(ArticleLibraryFilter.favorites.includes(row))
        XCTAssertFalse(ArticleLibraryFilter.archived.includes(row))

        row.isRead = true
        XCTAssertTrue(ArticleLibraryFilter.all.includes(row))
        XCTAssertFalse(ArticleLibraryFilter.unread.includes(row))

        row.isFavorite = true
        XCTAssertTrue(ArticleLibraryFilter.favorites.includes(row))

        row.isArchived = true
        XCTAssertFalse(ArticleLibraryFilter.all.includes(row))
        XCTAssertFalse(ArticleLibraryFilter.unread.includes(row))
        XCTAssertFalse(ArticleLibraryFilter.favorites.includes(row))
        XCTAssertTrue(ArticleLibraryFilter.archived.includes(row))
    }

    @MainActor func testFlagTogglesPersistThroughExistingLibraryMutations() throws {
        let library = try Library()
        let saved = try library.saveURL("https://example.com/swipe")
        var row = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(row.isRead)
        XCTAssertFalse(row.isFavorite)
        XCTAssertFalse(row.isArchived)

        try library.toggleRead(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertTrue(row.isRead)
        XCTAssertEqual(ArticleSwipeAction.read(for: row).title, "Mark unread")
        XCTAssertFalse(ArticleLibraryFilter.unread.includes(row))

        try library.toggleRead(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(row.isRead)
        XCTAssertEqual(ArticleSwipeAction.read(for: row).title, "Mark read")

        try library.toggleFavorite(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertTrue(row.isFavorite)
        XCTAssertEqual(ArticleSwipeAction.favorite(for: row).title, "Remove favorite")
        XCTAssertTrue(ArticleLibraryFilter.favorites.includes(row))

        try library.toggleFavorite(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(row.isFavorite)

        try library.toggleArchived(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertTrue(row.isArchived)
        XCTAssertEqual(ArticleSwipeAction.archive(for: row).title, "Move to Inbox")
        XCTAssertFalse(ArticleLibraryFilter.all.includes(row))
        XCTAssertTrue(ArticleLibraryFilter.archived.includes(row))

        try library.toggleArchived(id: saved.id)
        row = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(row.isArchived)
        XCTAssertEqual(ArticleSwipeAction.archive(for: row).title, "Archive")
        XCTAssertTrue(ArticleLibraryFilter.all.includes(row))
    }
}
