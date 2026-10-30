import Foundation

/// HTTP(S) URLs that the reader can hand to Safari. Saved `text:` drafts and
/// credentialed links stay in the app instead of opening an original site.
public enum ArticleOriginalSite {
    public static func url(from value: String) -> URL? {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
              parts.user == nil, parts.password == nil,
              let host = parts.host, !host.isEmpty
        else { return nil }
        parts.scheme = scheme
        return parts.url
    }
}
