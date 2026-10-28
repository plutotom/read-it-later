import Foundation

/// Library list segments. Archived rows stay out of All / Unread / Favorites.
public enum ArticleLibraryFilter: String, CaseIterable, Sendable {
    case all = "All"
    case unread = "Unread"
    case favorites = "Favorites"
    case archived = "Archived"

    public func includes(_ article: Article) -> Bool {
        switch self {
        case .all: !article.isArchived
        case .unread: !article.isRead && !article.isArchived
        case .favorites: article.isFavorite && !article.isArchived
        case .archived: article.isArchived
        }
    }
}

/// Gmail-style row actions: two leading, two trailing. The first on each edge is the full swipe.
public struct ArticleSwipeAction: Equatable, Sendable {
    public enum Kind: String, Sendable { case read, favorite, archive, delete }
    public enum Edge: String, Sendable { case leading, trailing }
    public enum Tint: String, Sendable { case blue, orange, gray, red }

    public let kind: Kind
    public let edge: Edge
    public let title: String
    public let systemImage: String
    public let accessibilityLabel: String
    public let tint: Tint
    public let isDestructive: Bool

    public static func all(for article: Article) -> [ArticleSwipeAction] {
        [read(for: article), favorite(for: article), archive(for: article), delete]
    }

    public static func leading(for article: Article) -> [ArticleSwipeAction] {
        [read(for: article), favorite(for: article)]
    }

    public static func trailing(for article: Article) -> [ArticleSwipeAction] {
        [archive(for: article), delete]
    }

    public static func read(for article: Article) -> ArticleSwipeAction {
        ArticleSwipeAction(
            kind: .read,
            edge: .leading,
            title: article.isRead ? "Mark unread" : "Mark read",
            systemImage: article.isRead ? "envelope.badge" : "checkmark.circle",
            accessibilityLabel: article.isRead ? "Mark as unread" : "Mark as read",
            tint: .blue,
            isDestructive: false
        )
    }

    public static func favorite(for article: Article) -> ArticleSwipeAction {
        ArticleSwipeAction(
            kind: .favorite,
            edge: .leading,
            title: article.isFavorite ? "Remove favorite" : "Favorite",
            systemImage: article.isFavorite ? "star.fill" : "star",
            accessibilityLabel: article.isFavorite ? "Remove from favorites" : "Add to favorites",
            tint: .orange,
            isDestructive: false
        )
    }

    public static func archive(for article: Article) -> ArticleSwipeAction {
        ArticleSwipeAction(
            kind: .archive,
            edge: .trailing,
            title: article.isArchived ? "Move to Inbox" : "Archive",
            systemImage: article.isArchived ? "tray" : "archivebox",
            accessibilityLabel: article.isArchived ? "Move to Inbox" : "Archive",
            tint: .gray,
            isDestructive: false
        )
    }

    public static let delete = ArticleSwipeAction(
        kind: .delete,
        edge: .trailing,
        title: "Delete",
        systemImage: "trash",
        accessibilityLabel: "Delete article",
        tint: .red,
        isDestructive: true
    )
}
