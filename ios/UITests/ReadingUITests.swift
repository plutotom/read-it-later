import XCTest

final class ReadingUITests: XCTestCase {
    @MainActor func testOfflineReaderAndNote() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        let noteButton = app.buttons["Add a note"]
        XCTAssertTrue(noteButton.waitForExistence(timeout: 5))
        noteButton.tap()
        let editor = app.textViews["Article note"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText("An offline note")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["An offline note"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Offline reader with note"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testSelectTextHighlightAndRemove() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        let reader = app.textViews["articleText"]
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        reader.press(forDuration: 1.2)
        let highlightAction = app.buttons["Highlight"]
        XCTAssertTrue(highlightAction.waitForExistence(timeout: 8))
        highlightAction.tap()
        let highlights = app.buttons["showHighlights"]
        XCTAssertTrue(highlights.waitForExistence(timeout: 5))
        XCTAssertEqual(highlights.label, "Highlights (1)")
        highlights.tap()
        let remove = app.buttons["Remove highlight"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        XCTAssertTrue(app.staticTexts["No highlights yet"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        XCTAssertEqual(app.buttons["showHighlights"].label, "Highlights (0)")
    }
}
