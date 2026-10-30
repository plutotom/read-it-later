import XCTest
@testable import ReadingCore

final class ArticleWebURLTests: XCTestCase {
    func testPreservesArticlePathsQueryStringsAndFragments() {
        let interactive = "https://example.com/interactive?view=chart#results"
        XCTAssertEqual(ArticleWebURL.parse(interactive)?.absoluteString, interactive)
        XCTAssertEqual(ArticleWebURL.parse("http://example.com/article")?.absoluteString, "http://example.com/article")
    }

    func testRejectsUnsafeOrNonWebNavigation() {
        let rejected = [
            "javascript:alert(document.cookie)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "blob:https://example.com/id",
            "/api/auth",
            "not a url",
            "https://user:password@example.com/article",
            "https://user@example.com/article",
            "text:local-note"
        ]
        for value in rejected {
            XCTAssertNil(ArticleWebURL.parse(value), value)
            XCTAssertFalse(ArticleWebURL.canLoadInApp(urlString: value), value)
            XCTAssertEqual(ArticleWebURL.decision(for: URL(string: value)), .cancel, value)
        }
        XCTAssertNil(ArticleWebURL.parse("about:blank"))
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "about:blank")), .allow)
        XCTAssertEqual(ArticleWebURL.decision(for: nil), .cancel)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "about:blank"), isMainFrame: false), .allow)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "javascript:alert(1)"), isMainFrame: false), .cancel)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "data:text/plain,hi")), .cancel)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "file:///etc/passwd")), .cancel)
    }

    func testHTTPSLoadsInAppAndPlainHTTPDoesNot() {
        XCTAssertTrue(ArticleWebURL.canLoadInApp(urlString: "https://example.com/offline"))
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "https://example.com/offline")), .allow)
        XCTAssertFalse(ArticleWebURL.canLoadInApp(urlString: "http://example.com/article"))
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "http://example.com/article")), .cancel)
    }

    func testLoopbackHTTPCanLoadInApp() throws {
        XCTAssertTrue(ArticleWebURL.canLoadInApp(urlString: "http://localhost:4114/article"))
        XCTAssertTrue(ArticleWebURL.canLoadInApp(urlString: "http://127.0.0.1/article"))
        XCTAssertTrue(ArticleWebURL.canLoadInApp(urlString: "http://[::1]/article"))
        var ipv6 = URLComponents()
        ipv6.scheme = "http"
        ipv6.host = "::1"
        ipv6.path = "/article"
        let ipv6URL = try XCTUnwrap(ipv6.url)
        XCTAssertEqual(ArticleWebURL.decision(for: ipv6URL), .allow)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "http://[::1]/article")), .allow)
        XCTAssertEqual(ArticleWebURL.decision(for: URL(string: "http://localhost/")), .allow)
    }

    @MainActor func testHintAppearsOncePerArticleInThisProcess() {
        ArticleWebViewHintStore.reset()
        XCTAssertTrue(ArticleWebViewHintStore.consumeFirstVisit(articleID: "article-a"))
        XCTAssertFalse(ArticleWebViewHintStore.consumeFirstVisit(articleID: "article-a"))
        XCTAssertTrue(ArticleWebViewHintStore.consumeFirstVisit(articleID: "article-b"))
        ArticleWebViewHintStore.reset()
        XCTAssertTrue(ArticleWebViewHintStore.consumeFirstVisit(articleID: "article-a"))
    }
}
