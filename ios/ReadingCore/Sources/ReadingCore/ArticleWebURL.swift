import Foundation

public enum ArticleWebNavigationDecision: Equatable, Sendable {
    case allow
    case cancel
}

/// HTTP(S) article URLs that may be opened as the original website.
public enum ArticleWebURL {
    /// Navigable web URL with no embedded credentials, or `nil` for unsafe values.
    public static func parse(_ value: String) -> URL? {
        guard var components = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        guard let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme) else { return nil }
        guard components.user == nil, components.password == nil else { return nil }
        guard let host = components.host, !host.isEmpty else { return nil }
        components.scheme = scheme
        return components.url
    }

    /// ATS allows HTTPS everywhere and HTTP only for loopback hosts.
    public static func canLoadInApp(_ url: URL) -> Bool {
        if let parsed = parse(url.absoluteString) {
            return canLoadParsedInApp(parsed)
        }
        guard url.user == nil, url.password == nil, let host = host(of: url), !host.isEmpty else { return false }
        return canLoadParsedInApp(url)
    }

    public static func canLoadInApp(urlString: String) -> Bool {
        guard let url = parse(urlString) else { return false }
        return canLoadParsedInApp(url)
    }

    /// Main-frame navigations stay on HTTP(S) without credentials. Subframes may use the document's own about/blob/data URLs.
    public static func decision(for url: URL?, isMainFrame: Bool = true) -> ArticleWebNavigationDecision {
        let scheme = url?.scheme?.lowercased()
        if !isMainFrame {
            if ["http", "https"].contains(scheme ?? "") {
                return url.flatMap { parse($0.absoluteString) } == nil ? .cancel : .allow
            }
            if ["about", "blob", "data"].contains(scheme ?? "") {
                return .allow
            }
            return .cancel
        }
        if scheme == "about" { return .allow }
        guard let url, canLoadInApp(url) else { return .cancel }
        return .allow
    }

    private static func canLoadParsedInApp(_ url: URL) -> Bool {
        switch url.scheme?.lowercased() {
        case "https":
            return true
        case "http":
            return isLoopbackHost(host(of: url))
        default:
            return false
        }
    }

    /// `URL.host` is nil for IPv6 literals such as `http://[::1]/`; `URLComponents.host` keeps `::1`.
    private static func host(of url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.host ?? url.host
    }

    private static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host else { return false }
        let value = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        return value == "localhost" || value == "127.0.0.1" || value == "::1" || value == "0:0:0:0:0:0:0:1"
    }
}

/// Process-lifetime first-visit tracking for the in-app original website tip.
@MainActor
public enum ArticleWebViewHintStore {
    private static var seenArticleIDs: Set<String> = []

    /// Returns `true` the first time this article enters Web view in this process.
    public static func consumeFirstVisit(articleID: String) -> Bool {
        seenArticleIDs.insert(articleID).inserted
    }

    public static func reset() {
        seenArticleIDs.removeAll()
    }
}

#if canImport(WebKit)
import WebKit

/// Every viewer receives a fresh ephemeral publisher session.
@MainActor
public enum ArticleWebsiteConfiguration {
    public static func make() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        #if os(iOS)
        configuration.allowsInlineMediaPlayback = true
        #endif
        return configuration
    }
}
#endif
