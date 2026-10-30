import Foundation

/// HTTP(S) URLs that the reader can hand to Safari. Saved `text:` drafts and
/// credentialed links stay in the app instead of opening an original site.
public enum ArticleOriginalSite {
    public static func url(from value: String) -> URL? {
        ArticleWebURL.parse(value)
    }
}
