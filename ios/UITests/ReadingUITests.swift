import XCTest

final class ReadingUITests: XCTestCase {
    @MainActor func testOfflineReaderAndNote() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        app.buttons["Reading options"].tap()
        app.buttons["Edit note"].tap()
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
}
