import Foundation

/// Library places. Inbox and Archive are destinations; unread is a mark on a row.
public enum ArticleLibraryFilter: String, CaseIterable, Sendable {
    case inbox = "Inbox"
    case archive = "Archive"

    public func includes(_ article: Article) -> Bool {
        switch self {
        case .inbox: !article.isArchived
        case .archive: article.isArchived
        }
    }
}

/// Mail-style row actions with compact labels for the system's rounded swipe buttons.
/// The first action on each edge is the full swipe.
public struct ArticleSwipeAction: Equatable, Sendable {
    public enum Kind: String, Sendable { case read, archive, delete }
    public enum Edge: String, Sendable { case leading, trailing }
    public enum Tint: String, Sendable { case blue, orange, gray }

    public let kind: Kind
    public let edge: Edge
    public let title: String
    public let systemImage: String
    public let accessibilityLabel: String
    public let tint: Tint?
    public let isDestructive: Bool

    public static func all(for article: Article) -> [ArticleSwipeAction] {
        [read(for: article), archive(for: article), delete]
    }

    public static func leading(for article: Article) -> [ArticleSwipeAction] {
        [read(for: article)]
    }

    public static func trailing(for article: Article) -> [ArticleSwipeAction] {
        [archive(for: article), delete]
    }

    public static func read(for article: Article) -> ArticleSwipeAction {
        ArticleSwipeAction(
            kind: .read,
            edge: .leading,
            title: article.isRead ? "Unread" : "Read",
            systemImage: article.isRead ? "envelope.badge.fill" : "envelope.open.fill",
            accessibilityLabel: article.isRead ? "Mark as unread" : "Mark as read",
            tint: .blue,
            isDestructive: false
        )
    }

    public static func archive(for article: Article) -> ArticleSwipeAction {
        ArticleSwipeAction(
            kind: .archive,
            edge: .trailing,
            title: article.isArchived ? "Inbox" : "Archive",
            systemImage: article.isArchived ? "tray.fill" : "archivebox.fill",
            accessibilityLabel: article.isArchived ? "Move to Inbox" : "Archive",
            tint: .gray,
            isDestructive: false
        )
    }

    public static let delete = ArticleSwipeAction(
        kind: .delete,
        edge: .trailing,
        title: "Delete",
        systemImage: "trash.fill",
        accessibilityLabel: "Delete article",
        tint: nil,
        isDestructive: true
    )
}
