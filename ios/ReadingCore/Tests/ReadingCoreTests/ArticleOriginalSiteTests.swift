import XCTest
@testable import ReadingCore

final class ArticleOriginalSiteTests: XCTestCase {
    func testAcceptsPublicHTTPAndHTTPSLinks() {
        XCTAssertEqual(
            ArticleOriginalSite.url(from: " https://example.com/story?q=1#part ")?.absoluteString,
            "https://example.com/story?q=1#part"
        )
        XCTAssertEqual(
            ArticleOriginalSite.url(from: "http://EXAMPLE.com/offline")?.host,
            "EXAMPLE.com"
        )
    }

    func testNormalizesSchemeAndPreservesPublisherLocation() {
        XCTAssertEqual(
            ArticleOriginalSite.url(from: "HTTPS://example.com:8443/story%20one?q=a%26b#section")?.absoluteString,
            "https://example.com:8443/story%20one?q=a%26b#section"
        )
    }

    func testRejectsNonWebAndCredentialedLinks() {
        for input in [
            "https:///",
            "https://",
            "https://:password@example.com/",
            "https://@example.com/",
            "mailto:reader@example.com",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "text://manual-fixture",
            "https://user:pass@example.com/secret",
            "https://user@example.com/",
            "not a url",
            "",
        ] {
            XCTAssertNil(ArticleOriginalSite.url(from: input), input)
        }
    }
}
