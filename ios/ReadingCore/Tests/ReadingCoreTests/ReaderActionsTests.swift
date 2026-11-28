import XCTest
@testable import ReadingCore

final class ReaderActionsTests: XCTestCase {
    private func context(
        isWebView: Bool = false,
        canSwitchView: Bool = true,
        isRead: Bool = false,
        isArchived: Bool = false,
        canListen: Bool = true,
        listenTitle: String = "Listen",
        highlightCount: Int = 0,
        showHighlights: Bool = true,
        canViewOriginalSite: Bool = true,
        canShare: Bool = true,
        showSavedVersions: Bool = false,
        preparingAudio: Bool = false
    ) -> ReaderActionCatalog.Context {
        ReaderActionCatalog.Context(
            isWebView: isWebView,
            canSwitchView: canSwitchView,
            isRead: isRead,
            isArchived: isArchived,
            annotationSyncEnabled: false,
            canListen: canListen,
            listenTitle: listenTitle,
            highlightCount: highlightCount,
            showHighlights: showHighlights,
            canViewOriginalSite: canViewOriginalSite,
            canShare: canShare,
            showSavedVersions: showSavedVersions,
            preparingAudio: preparingAudio
        )
    }

    func testToolbarPutsListenNotesShareAndMoreInReach() {
        XCTAssertEqual(
            ReaderActionCatalog.toolbar(for: context()).map(\.kind),
            [.listen, .notes, .share, .more]
        )
        XCTAssertEqual(ReaderActionCatalog.toolbar(for: context()).map(\.accessibilityIdentifier), [
            "startListening", "readerToolbarNotes", "readerToolbarShare", "Reading options",
        ])
        XCTAssertEqual(ReaderActionCatalog.toolbar(for: context()).first { $0.kind == .notes }?.title, "Add a note")
    }

    func testToolbarHidesListenAndKeepsMoreInWebView() {
        XCTAssertEqual(
            ReaderActionCatalog.toolbar(for: context(isWebView: true)).map(\.kind),
            [.notes, .share, .more]
        )
    }

    func testOverflowGroupsMatchExistingActionsWithoutUnsupportedTools() {
        let groups = ReaderActionCatalog.overflowGroups(for: context())
        XCTAssertEqual(groups.map { $0.map(\.kind) }, [
            [.markRead, .archive, .delete],
            [.notes, .highlights, .largerText, .smallerText],
            [.switchView, .listen, .viewOriginalSite],
            [.share],
        ])
        let kinds = Set(groups.flatMap { $0.map(\.kind) })
        XCTAssertTrue(groups[0].last?.isDestructive == true)
        XCTAssertEqual(groups[0].last?.title, "Delete")
        XCTAssertFalse(kinds.contains { ["summarize", "speedRead", "tags", "favorite"].contains($0.rawValue) })
        XCTAssertEqual(groups.flatMap { $0 }.map(\.title), [
            "Mark read", "Archive", "Delete",
            "Notes", "Highlights", "Larger text", "Smaller text",
            "Switch to Web view", "Listen", "View original site",
            "Share",
        ])
    }

    func testOverflowAdaptsReadArchiveWebAndSavedVersions() {
        let archived = context(isWebView: true, isRead: true, isArchived: true, showSavedVersions: true)
        let items = ReaderActionCatalog.overflowItems(for: archived)
        XCTAssertEqual(items.map(\.title), [
            "Mark unread", "Move to Inbox", "Delete",
            "Notes", "Highlights",
            "Switch to Reader view", "View original site",
            "Share", "Saved text versions",
        ])
        XCTAssertFalse(items.contains { $0.kind == .listen || $0.kind == .largerText || $0.kind == .smallerText })
        XCTAssertEqual(items.first { $0.kind == .switchView }?.accessibilityIdentifier, "switchArticleView")
        XCTAssertEqual(items.first { $0.kind == .viewOriginalSite }?.accessibilityIdentifier, "viewOriginalSite")
    }

    func testListenStaysDisabledWhilePreparingAndKeepsUniqueIdentifiers() {
        let preparing = context(listenTitle: "Preparing…", preparingAudio: true)
        let toolbar = ReaderActionCatalog.toolbar(for: preparing)
        let overflow = ReaderActionCatalog.overflowItems(for: preparing)
        XCTAssertEqual(toolbar.first { $0.kind == .listen }?.disabled, true)
        XCTAssertEqual(overflow.first { $0.kind == .listen }?.disabled, true)
        XCTAssertEqual(toolbar.first { $0.kind == .listen }?.accessibilityIdentifier, "startListening")
        XCTAssertEqual(overflow.first { $0.kind == .listen }?.accessibilityIdentifier, "readerMenuListen")
        XCTAssertNotEqual(
            toolbar.first { $0.kind == .notes }?.accessibilityIdentifier,
            overflow.first { $0.kind == .notes }?.accessibilityIdentifier
        )
    }

    func testToolbarOmitsShareAndListenWhenThoseActionsAreUnavailable() {
        let limited = context(
            canSwitchView: false,
            canListen: false,
            showHighlights: false,
            canViewOriginalSite: false,
            canShare: false
        )
        XCTAssertEqual(ReaderActionCatalog.toolbar(for: limited).map(\.kind), [.notes, .more])
        XCTAssertEqual(
            ReaderActionCatalog.overflowItems(for: limited).map(\.kind),
            [.markRead, .archive, .delete, .notes, .largerText, .smallerText]
        )
    }
}
