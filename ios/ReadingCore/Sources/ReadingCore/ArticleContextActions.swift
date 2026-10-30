import Foundation

/// Home-list press-and-hold actions: Share, Copy link, Delete.
/// Link actions are omitted for drafts, non-web URLs, and URLs containing credentials.
public struct ArticleContextAction: Equatable, Sendable {
    public enum Kind: String, Sendable { case share, copyLink, delete }

    public let kind: Kind
    public let title: String
    public let systemImage: String
    public let accessibilityLabel: String
    public let isDestructive: Bool

    public static func all(for article: Article) -> [ArticleContextAction] {
        var actions: [ArticleContextAction] = [delete]
        if shareURL(for: article) != nil {
            actions.insert(contentsOf: [share, copyLink], at: 0)
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
              ["http", "https"].contains(scheme),
              let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil
        else { return nil }
        return url
    }

    public static func copyLinkValue(for article: Article) -> String {
        article.url
    }
}
