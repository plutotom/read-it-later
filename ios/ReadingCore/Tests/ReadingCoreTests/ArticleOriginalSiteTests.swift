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

    func testRejectsNonWebAndCredentialedLinks() {
        for input in [
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
