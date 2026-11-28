import Foundation

/// Reader chrome: a bottom capsule of frequent actions plus a grouped overflow menu.
/// Only existing article actions are listed. Tags, folders, summarize, and speed-read stay out.
public struct ReaderActionCatalog: Equatable, Sendable {
    public enum Kind: String, Sendable {
        case listen, notes, share, more
        case switchView, markRead, archive, delete
        case highlights, largerText, smallerText
        case viewOriginalSite, savedVersions
    }

    public struct Item: Equatable, Sendable, Identifiable {
        public var id: Kind { kind }
        public let kind: Kind
        public let title: String
        public let systemImage: String
        public let accessibilityLabel: String
        public let accessibilityIdentifier: String
        public let isDestructive: Bool
        public let disabled: Bool
    }

    public struct Context: Equatable, Sendable {
        public var isWebView: Bool
        public var canSwitchView: Bool
        public var isRead: Bool
        public var isArchived: Bool
        public var annotationSyncEnabled: Bool
        public var canListen: Bool
        public var listenTitle: String
        public var highlightCount: Int
        public var showHighlights: Bool
        public var canViewOriginalSite: Bool
        public var canShare: Bool
        public var showSavedVersions: Bool
        public var preparingAudio: Bool

        public init(
            isWebView: Bool,
            canSwitchView: Bool,
            isRead: Bool,
            isArchived: Bool,
            annotationSyncEnabled: Bool,
            canListen: Bool,
            listenTitle: String,
            highlightCount: Int,
            showHighlights: Bool,
            canViewOriginalSite: Bool,
            canShare: Bool,
            showSavedVersions: Bool,
            preparingAudio: Bool
        ) {
            self.isWebView = isWebView
            self.canSwitchView = canSwitchView
            self.isRead = isRead
            self.isArchived = isArchived
            self.annotationSyncEnabled = annotationSyncEnabled
            self.canListen = canListen
            self.listenTitle = listenTitle
            self.highlightCount = highlightCount
            self.showHighlights = showHighlights
            self.canViewOriginalSite = canViewOriginalSite
            self.canShare = canShare
            self.showSavedVersions = showSavedVersions
            self.preparingAudio = preparingAudio
        }
    }

    public static func toolbar(for context: Context) -> [Item] {
        var items: [Item] = []
        if context.canListen, !context.isWebView {
            items.append(listen(context, identifier: "startListening"))
        }
        items.append(notes(title: "Add a note", identifier: "readerToolbarNotes"))
        if context.canShare { items.append(share(identifier: "readerToolbarShare")) }
        items.append(more)
        return items
    }

    public static func overflowGroups(for context: Context) -> [[Item]] {
        [
            organize(context),
            reading(context),
            consume(context),
            export(context),
        ].filter { !$0.isEmpty }
    }

    public static func overflowItems(for context: Context) -> [Item] {
        overflowGroups(for: context).flatMap { $0 }
    }

    private static func organize(_ context: Context) -> [Item] {
        [
            Item(
                kind: .markRead,
                title: context.isRead ? "Mark unread" : "Mark read",
                systemImage: context.isRead ? "circle" : "checkmark.circle",
                accessibilityLabel: context.isRead ? "Mark unread" : "Mark read",
                accessibilityIdentifier: "readerMenuMarkRead",
                isDestructive: false,
                disabled: false
            ),
            Item(
                kind: .archive,
                title: context.isArchived ? "Move to Inbox" : "Archive",
                systemImage: context.isArchived ? "tray" : "archivebox",
                accessibilityLabel: context.isArchived ? "Move to Inbox" : "Archive",
                accessibilityIdentifier: "readerMenuArchive",
                isDestructive: false,
                disabled: false
            ),
            Item(
                kind: .delete,
                title: "Delete",
                systemImage: "trash",
                accessibilityLabel: "Delete article",
                accessibilityIdentifier: "readerMenuDelete",
                isDestructive: true,
                disabled: false
            ),
        ]
    }

    private static func reading(_ context: Context) -> [Item] {
        var items = [notes(title: "Notes", identifier: "readerMenuNotes")]
        if context.showHighlights {
            items.append(
                Item(
                    kind: .highlights,
                    title: context.highlightCount == 0 ? "Highlights" : "Highlights (\(context.highlightCount))",
                    systemImage: "highlighter",
                    accessibilityLabel: context.highlightCount == 0 ? "Highlights" : "Highlights (\(context.highlightCount))",
                    accessibilityIdentifier: "readerMenuHighlights",
                    isDestructive: false,
                    disabled: false
                )
            )
        }
        if !context.isWebView {
            items.append(
                Item(
                    kind: .largerText,
                    title: "Larger text",
                    systemImage: "textformat.size.larger",
                    accessibilityLabel: "Larger text",
                    accessibilityIdentifier: "readerMenuLargerText",
                    isDestructive: false,
                    disabled: false
                )
            )
            items.append(
                Item(
                    kind: .smallerText,
                    title: "Smaller text",
                    systemImage: "textformat.size.smaller",
                    accessibilityLabel: "Smaller text",
                    accessibilityIdentifier: "readerMenuSmallerText",
                    isDestructive: false,
                    disabled: false
                )
            )
        }
        return items
    }

    private static func consume(_ context: Context) -> [Item] {
        var items: [Item] = []
        if context.canSwitchView {
            items.append(
                Item(
                    kind: .switchView,
                    title: context.isWebView ? "Switch to Reader view" : "Switch to Web view",
                    systemImage: context.isWebView ? "book" : "globe",
                    accessibilityLabel: context.isWebView ? "Switch to Reader view" : "Switch to Web view",
                    accessibilityIdentifier: "switchArticleView",
                    isDestructive: false,
                    disabled: false
                )
            )
        }
        if context.canListen, !context.isWebView {
            items.append(listen(context, identifier: "readerMenuListen"))
        }
        if context.canViewOriginalSite {
            items.append(
                Item(
                    kind: .viewOriginalSite,
                    title: "View original site",
                    systemImage: "safari",
                    accessibilityLabel: "View original site",
                    accessibilityIdentifier: "viewOriginalSite",
                    isDestructive: false,
                    disabled: false
                )
            )
        }
        return items
    }

    private static func export(_ context: Context) -> [Item] {
        var items: [Item] = []
        if context.canShare { items.append(share(identifier: "readerMenuShare")) }
        if context.showSavedVersions {
            items.append(
                Item(
                    kind: .savedVersions,
                    title: "Saved text versions",
                    systemImage: "clock.arrow.circlepath",
                    accessibilityLabel: "Saved text versions",
                    accessibilityIdentifier: "readerMenuSavedVersions",
                    isDestructive: false,
                    disabled: false
                )
            )
        }
        return items
    }

    private static func listen(_ context: Context, identifier: String) -> Item {
        Item(
            kind: .listen,
            title: context.listenTitle,
            systemImage: "headphones",
            accessibilityLabel: context.listenTitle,
            accessibilityIdentifier: identifier,
            isDestructive: false,
            disabled: context.preparingAudio
        )
    }

    private static func notes(title: String, identifier: String) -> Item {
        Item(
            kind: .notes,
            title: title,
            systemImage: "square.and.pencil",
            accessibilityLabel: title,
            accessibilityIdentifier: identifier,
            isDestructive: false,
            disabled: false
        )
    }

    private static func share(identifier: String) -> Item {
        Item(
            kind: .share,
            title: "Share",
            systemImage: "square.and.arrow.up",
            accessibilityLabel: "Share",
            accessibilityIdentifier: identifier,
            isDestructive: false,
            disabled: false
        )
    }

    private static let more = Item(
        kind: .more,
        title: "Reading options",
        systemImage: "ellipsis",
        accessibilityLabel: "Reading options",
        accessibilityIdentifier: "Reading options",
        isDestructive: false,
        disabled: false
    )
}
