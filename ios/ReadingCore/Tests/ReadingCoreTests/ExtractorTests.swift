import XCTest
@testable import ReadingCore

final class ExtractorTests: XCTestCase {
    func testLegacyTableArticleWithShortQuoteRetainsSurroundingText() throws {
        let opening = String(repeating: "Opening essay text. ", count: 8).trimmingCharacters(in: .whitespaces)
        let ending = String(repeating: "Closing essay text. ", count: 8).trimmingCharacters(in: .whitespaces)
        let html = """
        <html><head><title>Legacy essay</title></head><body>
        <table><tr><td><font>\(opening)<br><br>
        <blockquote>A short quotation.</blockquote>\(ending)
        </font></td></tr></table></body></html>
        """
        let result = try Extractor.parse(html: html)
        XCTAssertEqual(result.title, "Legacy essay")
        XCTAssertEqual(result.text, [opening, "A short quotation.", ending].joined(separator: "\n\n"))
    }

    func testLongQuoteDoesNotSilentlyReplaceTheRestOfTheArticle() throws {
        let quote = String(repeating: "A longer quotation. ", count: 10).trimmingCharacters(in: .whitespaces)
        let result = try Extractor.parse(html: "<body><font>Opening text outside paragraph tags.<blockquote>\(quote)</blockquote>Ending text outside paragraph tags.</font></body>")
        XCTAssertEqual(result.text, ["Opening text outside paragraph tags.", quote, "Ending text outside paragraph tags."].joined(separator: "\n\n"))
    }

    func testNestedBlocksKeepTheirOwnTextOnceInDocumentOrder() throws {
        let result = try Extractor.parse(html: """
        <article><h1>Heading</h1><blockquote>Quote introduction.<p>Nested paragraph with enough useful text for reading.</p>Quote conclusion.</blockquote>
        <ul><li>List introduction.<p>Nested list paragraph.</p>List conclusion.</li></ul></article>
        """)
        XCTAssertEqual(result.text, ["Heading", "Quote introduction.", "Nested paragraph with enough useful text for reading.", "Quote conclusion.", "List introduction.", "Nested list paragraph.", "List conclusion."].joined(separator: "\n\n"))
    }

    func testBreaksSeparateTextAndInlineFormattingPreservesWordBoundaries() throws {
        let result = try Extractor.parse(html: """
        <main>First <b>bold</b> sentence with enough text to be readable.<br><br>
        Second sentence contains co<strong>de</strong> and an &amp; entity.<br>Final sentence.</main>
        """)
        XCTAssertEqual(result.text, ["First bold sentence with enough text to be readable.", "Second sentence contains code and an & entity.", "Final sentence."].joined(separator: "\n\n"))
    }

    func testPreformattedCodeKeepsLineBreaksAndIndentation() throws {
        let introduction = String(repeating: "An explanation of the code. ", count: 4).trimmingCharacters(in: .whitespaces)
        let code = "if ready {\n    run()\n}"
        let result = try Extractor.parse(html: "<article><p>\(introduction)</p><pre><code>\(code)</code></pre></article>")
        XCTAssertEqual(result.text, [introduction, code].joined(separator: "\n\n"))
    }
}
