import XCTest

final class ReadingUITests: XCTestCase {
    @MainActor private func launchFreshApp(importSharedLinks: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-ui-test-library"]
        if importSharedLinks { app.launchArguments.append("--ui-testing-import-inbox") }
        app.launch()
        return app
    }

    @MainActor private func reopen(_ app: XCUIApplication) {
        app.terminate()
        app.launchArguments = ["--ui-testing"]
        app.launch()
    }

    @MainActor func testSilentListeningPlayerAndParagraphAction() throws {
        let app = launchFreshApp()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        let text = app.textViews["articleText"]
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        text.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.04)).tap()
        let play = app.menuItems["Play from paragraph"]
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        play.tap()
        let expand = app.buttons["expandPlayer"]
        XCTAssertTrue(expand.waitForExistence(timeout: 5))
        expand.tap()
        XCTAssertTrue(app.staticTexts["Silent listening preview"].waitForExistence(timeout: 5))
        app.buttons["playerPlayPause"].tap()
        XCTAssertEqual(app.staticTexts["playbackStatus"].label, "Paused")
        app.buttons["playbackSpeed"].tap()
        app.buttons["1.5×"].tap()
        app.buttons["playbackVoice"].tap()
        app.buttons["Preview B"].tap()
        XCTAssertEqual(app.staticTexts["playbackStatus"].label, "Paused")
        app.buttons["sleepTimer"].tap()
        app.buttons["5 minutes"].tap()
        app.sliders["playbackPosition"].adjust(toNormalizedSliderPosition: 0.65)
        XCTAssertTrue(app.buttons["Pause preview"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Silent listening player"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["Done"].tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(expand.waitForExistence(timeout: 5))
        app.buttons["Close listening player"].tap()
        XCTAssertFalse(expand.exists)
    }

    @MainActor func testOfflineReaderAndNote() throws {
        let app = launchFreshApp()
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
        app.buttons["Mark read"].tap()
        app.buttons["Reading options"].tap()
        app.buttons["Favorite"].tap()
        reopen(app)
        app.staticTexts["An offline test article"].tap()
        XCTAssertTrue(app.staticTexts["An offline note"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Read"].exists)
        app.buttons["Reading options"].tap()
        XCTAssertTrue(app.buttons["Remove favorite"].waitForExistence(timeout: 5))
        app.buttons["Remove favorite"].tap()
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Offline reader with note"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testSelectTextHighlightAndRemove() throws {
        let app = launchFreshApp()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        let reader = app.textViews["articleText"]
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        reader.press(forDuration: 1.2)
        // UITextView exposes selection actions as menu items, not buttons.
        let highlightAction = app.menuItems["Highlight"]
        XCTAssertTrue(highlightAction.waitForExistence(timeout: 8))
        highlightAction.tap()
        let highlights = app.buttons["showHighlights"]
        XCTAssertTrue(highlights.waitForExistence(timeout: 5))
        XCTAssertEqual(highlights.label, "Highlights (1)")
        highlights.tap()
        app.buttons["highlightColor"].tap()
        app.buttons["Pink"].tap()
        app.buttons["Done"].tap()
        reopen(app)
        app.staticTexts["An offline test article"].tap()
        XCTAssertTrue(highlights.waitForExistence(timeout: 5))
        XCTAssertEqual(highlights.label, "Highlights (1)")
        highlights.tap()
        XCTAssertTrue(app.buttons["highlightColor"].label.contains("Pink"))
        let remove = app.buttons["Remove highlight"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        XCTAssertTrue(app.staticTexts["No highlights yet"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        XCTAssertEqual(app.buttons["showHighlights"].label, "Highlights (0)")
    }

    @MainActor func testInvalidLinkKeepsDraftAndDuplicateKeepsOfflineText() throws {
        let app = launchFreshApp()
        app.buttons["Save a link"].tap()
        let input = app.textFields["articleURLInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        let placeholder = XCTAttachment(screenshot: app.screenshot())
        placeholder.name = "Save link placeholder"
        placeholder.lifetime = .keepAlways
        add(placeholder)
        input.typeText("not a url")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.alerts["Could not save link"].waitForExistence(timeout: 5))
        app.alerts.buttons["OK"].tap()
        XCTAssertEqual(input.value as? String, "not a url")
        input.tap()
        input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "not a url".count))
        input.typeText("https://example.com/offline#section")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["1 saved offline · On this iPhone"].waitForExistence(timeout: 5))
        reopen(app)
        app.staticTexts["An offline test article"].tap()
        XCTAssertTrue(app.textViews["articleText"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Download text"].exists)
    }

    @MainActor func testDownloadAndReopenArticle() throws {
        let app = launchFreshApp()
        app.buttons["Save a link"].tap()
        let input = app.textFields["articleURLInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("https://example.com/")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Example Domain"].waitForExistence(timeout: 50))
        reopen(app)
        app.staticTexts["Example Domain"].tap()
        let reader = app.textViews["articleText"]
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertTrue((reader.value as? String)?.contains("documentation") == true)
        XCTAssertFalse(app.buttons["Download text"].exists)
    }

    @MainActor func testSafariShareImportsLink() throws {
        let app = launchFreshApp(importSharedLinks: true)
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        defer { safari.terminate() }
        safari.launch()
        let address = safari.textFields["Address"]
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap()
        address.typeText("https://example.org/\n")
        let pageText = safari.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "documentation")).firstMatch
        XCTAssertTrue(pageText.waitForExistence(timeout: 40))
        let share = safari.buttons["Share"]
        XCTAssertTrue(share.waitForExistence(timeout: 20))
        share.tap()
        let extensionButton = safari.cells["Read It Later"]
        XCTAssertTrue(extensionButton.waitForExistence(timeout: 20))
        extensionButton.tap()
        XCTAssertTrue(safari.staticTexts["Link saved. Open Read It Later to download the text."].waitForExistence(timeout: 10))
        safari.buttons["Done"].tap()
        app.activate()
        XCTAssertTrue(app.staticTexts["example.org"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Example Domain"].waitForExistence(timeout: 50))
        reopen(app)
        app.staticTexts["Example Domain"].tap()
        XCTAssertTrue(app.textViews["articleText"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Safari capture reopened for offline reading"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
