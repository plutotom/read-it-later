import Foundation

/// Home-list press-and-hold actions: Share, Copy link, Delete.
/// Share is omitted when the saved URL cannot be opened as a link.
public struct ArticleContextAction: Equatable, Sendable {
    public enum Kind: String, Sendable { case share, copyLink, delete }

    public let kind: Kind
    public let title: String
    public let systemImage: String
    public let accessibilityLabel: String
    public let isDestructive: Bool

    public static func all(for article: Article) -> [ArticleContextAction] {
        var actions: [ArticleContextAction] = [copyLink, delete]
        if shareURL(for: article) != nil {
            actions.insert(share, at: 0)
        }
        return actions
    }

    public static let share = ArticleContextAction(
        kind: .share,
        title: "Share",
        systemImage: "square.and.arrow.up",
        accessibilityLabel: "Share article",
        isDestructive: false
    )

    public static let copyLink = ArticleContextAction(
        kind: .copyLink,
        title: "Copy link",
        systemImage: "link",
        accessibilityLabel: "Copy link",
        isDestructive: false
    )

    public static let delete = ArticleContextAction(
        kind: .delete,
        title: "Delete",
        systemImage: "trash",
        accessibilityLabel: "Delete article",
        isDestructive: true
    )

    public static func shareURL(for article: Article) -> URL? {
        guard let url = URL(string: article.url),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme)
        else { return nil }
        return url
    }

    public static func copyLinkValue(for article: Article) -> String {
        article.url
    }
}
