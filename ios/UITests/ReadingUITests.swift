import XCTest

final class ReadingUITests: XCTestCase {
    @MainActor func testLiveLibrarySyncWithBackendOutageAndRestart() throws {
        guard ProcessInfo.processInfo.environment["NATIVE_SYNC_LIVE_TEST"] == "1" else { throw XCTSkip("Requires isolated sync backend/proxy fixtures on ports 4115–4117") }
        try setFixtureBackendOffline(false)
        defer { try? setFixtureBackendOffline(false) }
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live", "--ui-testing-sync-live", "--reset-ui-test-library"]
        app.launch()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 15))
        app.textFields["authEmail"].tap(); app.textFields["authEmail"].typeText("native-sync@example.invalid")
        app.secureTextFields["authPassword"].tap(); app.secureTextFields["authPassword"].typeText("isolated-sync-password-123")
        app.buttons["authSignIn"].tap()
        XCTAssertTrue(app.staticTexts["A shared web article"].waitForExistence(timeout: 30))
        app.staticTexts["A shared web article"].tap()
        XCTAssertTrue(app.textViews["articleText"].waitForExistence(timeout: 10))
        app.buttons["Reading options"].tap(); app.buttons["Favorite"].tap()
        app.buttons["Paper Drive"].tap()
        XCTAssertTrue(app.navigationBars["Paper Drive"].waitForExistence(timeout: 5))
        try setFixtureBackendOffline(true)
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live", "--ui-testing-sync-live"]
        app.launch()
        XCTAssertTrue(app.staticTexts["A shared web article"].waitForExistence(timeout: 20))
        app.staticTexts["A shared web article"].tap()
        app.buttons["Mark read"].tap()
        app.buttons["Paper Drive"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "waiting to sync")).firstMatch.waitForExistence(timeout: 10))
        app.terminate()
        try setFixtureBackendOffline(false)
        app.launch()
        XCTAssertTrue(app.staticTexts["A shared web article"].waitForExistence(timeout: 20))
        app.staticTexts["A shared web article"].tap()
        XCTAssertTrue(app.buttons["Read"].waitForExistence(timeout: 10))
        app.buttons["Paper Drive"].tap()
        app.buttons["Save a link"].tap()
        let input = app.textFields["articleURLInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5)); input.tap()
        input.typeText("https://example.com/?from=paper-drive-sync-ui")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Example Domain"].waitForExistence(timeout: 50))
        for _ in 0..<3 where !app.buttons["Done"].exists {
            app.buttons["Settings"].tap()
            _ = app.buttons["Done"].waitForExistence(timeout: 3)
        }
        XCTAssertTrue(app.buttons["Done"].exists)
        let sync = app.buttons["syncNow"]
        for _ in 0..<3 where !sync.isHittable { app.swipeUp() }
        XCTAssertTrue(sync.waitForExistence(timeout: 5)); sync.tap()
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Shared account library after outage and restart"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Done"].tap()
    }

    @MainActor func testLiveIndependentNotesAndHighlightSync() throws {
        guard ProcessInfo.processInfo.environment["NATIVE_ANNOTATIONS_LIVE_TEST"] == "1" else { throw XCTSkip("Requires the isolated annotation backend and synthetic fixtures") }
        try setFixtureBackendOffline(false)
        defer { try? setFixtureBackendOffline(false) }
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live", "--ui-testing-sync-live", "--reset-ui-test-library"]
        app.launch()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 15))
        app.textFields["authEmail"].tap(); app.textFields["authEmail"].typeText("native-sync@example.invalid")
        app.secureTextFields["authPassword"].tap(); app.secureTextFields["authPassword"].typeText("isolated-sync-password-123")
        app.buttons["authSignIn"].tap()
        XCTAssertTrue(app.staticTexts["A shared web article"].waitForExistence(timeout: 30))
        app.staticTexts["A shared web article"].tap()
        XCTAssertTrue(app.textViews["articleText"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["showHighlights"].label, "Highlights (2)")
        app.buttons["showHighlights"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Saved quote")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        try setFixtureBackendOffline(true)
        app.buttons["Add a note"].tap()
        let editor = app.textViews["Article note"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5)); editor.tap(); editor.typeText("A native note saved offline")
        app.buttons["Save"].tap()
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live", "--ui-testing-sync-live"]
        app.launch()
        XCTAssertTrue(app.staticTexts["A shared web article"].waitForExistence(timeout: 20))
        app.staticTexts["A shared web article"].tap()
        let edit = app.buttons["editNote-00000000-0000-4000-8000-000000000045"]
        for _ in 0..<5 where !edit.isHittable || edit.frame.maxY > app.frame.maxY - 100 { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(app.staticTexts["A native note saved offline"].waitForExistence(timeout: 5))
        XCTAssertTrue(edit.isHittable); edit.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5)); editor.tap()
        editor.typeText(" — edited on iOS")
        app.buttons["Save"].tap()
        let remove = app.buttons["deleteNote-00000000-0000-4000-8000-000000000044"]
        for _ in 0..<4 where !remove.isHittable || remove.frame.minY < 120 { app.scrollViews.firstMatch.swipeDown() }
        XCTAssertTrue(remove.isHittable); remove.tap()
        try setFixtureBackendOffline(false)
        app.buttons["Paper Drive"].tap()
        app.buttons["Settings"].tap()
        let sync = app.buttons["syncNow"]
        for _ in 0..<4 where !sync.isHittable { app.swipeUp() }
        XCTAssertTrue(sync.waitForExistence(timeout: 5)); sync.tap()
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
        app.staticTexts["A shared web article"].tap()
        for _ in 0..<4 where !app.staticTexts["A native note saved offline"].isHittable { app.swipeUp() }
        XCTAssertFalse(app.staticTexts["First web note"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Second web note", "edited on iOS")).firstMatch.exists)
        let capture = XCTAttachment(screenshot: app.screenshot()); capture.name = "Independent notes after offline restart and sync"; capture.lifetime = .keepAlways; add(capture)
    }

    private func setFixtureBackendOffline(_ offline: Bool) throws {
        let expectation = expectation(description: "fixture backend control")
        var request = URLRequest(url: URL(string: "http://127.0.0.1:4117/state")!)
        request.httpMethod = "POST"; request.httpBody = Data((offline ? "offline" : "online").utf8)
        URLSession.shared.dataTask(with: request) { _, response, error in
            XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            expectation.fulfill()
        }.resume()
        wait(for: [expectation], timeout: 10)
    }

    @MainActor func testLivePasswordSessionRoundTrip() throws {
        guard ProcessInfo.processInfo.environment["NATIVE_AUTH_LIVE_TEST"] == "1" else { throw XCTSkip("Requires the isolated local auth fixture server on port 4115") }
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live", "--reset-ui-test-library"]
        app.launch()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 15))
        app.textFields["authEmail"].tap(); app.textFields["authEmail"].typeText("native-live@example.invalid")
        app.secureTextFields["authPassword"].tap(); app.secureTextFields["authPassword"].typeText("isolated-fixture-password-123")
        app.buttons["authSignIn"].tap()
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 20))
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["accountEmail"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["accountEmail"].label, "native-live@example.invalid")
        app.buttons["Done"].tap()
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth-live"]
        app.launch()
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 20))
        app.buttons["Settings"].tap()
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Real password session restored from Keychain"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["accountSignOut"].tap()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 15))
    }

    @MainActor func testAccountLoginPersistenceOfflineAccessAndIsolation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth", "--reset-ui-test-library"]
        app.launch()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 10))
        func signIn(_ email: String, password: String = "fixture-password-123") {
            let field = app.textFields["authEmail"]
            field.tap(); field.press(forDuration: 1.1)
            field.typeText(email)
            app.secureTextFields["authPassword"].tap(); app.secureTextFields["authPassword"].typeText(password)
            app.buttons["authSignIn"].tap()
        }
        signIn("alice@example.invalid", password: "wrong")
        XCTAssertTrue(app.staticTexts["authError"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth"]
        app.launch()
        signIn("alice@example.invalid")
        XCTAssertTrue(app.staticTexts["Alice’s private article"].waitForExistence(timeout: 10))
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth", "--ui-testing-auth-offline"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Alice’s private article"].waitForExistence(timeout: 10))
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["accountEmail"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["accountEmail"].label, "alice@example.invalid")
        app.buttons["accountSignOut"].tap()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 5))
        signIn("bob@example.invalid")
        XCTAssertTrue(app.navigationBars["Paper Drive"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Alice’s private article"].exists)
        app.buttons["Settings"].tap(); app.buttons["accountSignOut"].tap()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 5))
        signIn("alice@example.invalid")
        XCTAssertTrue(app.staticTexts["Alice’s private article"].waitForExistence(timeout: 10))
        app.terminate()
        app.launchArguments = ["--ui-testing", "--ui-testing-auth", "--ui-testing-auth-revoked"]
        app.launch()
        XCTAssertTrue(app.textFields["authEmail"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Alice’s private article"].exists)
    }

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

    @MainActor private func openStorage(_ app: XCUIApplication) {
        app.buttons["Settings"].tap()
        let storage = app.buttons["Manage storage"]
        for _ in 0..<5 where !storage.isHittable { app.swipeUp() }
        XCTAssertTrue(storage.waitForExistence(timeout: 5))
        storage.tap()
        XCTAssertTrue(app.navigationBars["Manage storage"].waitForExistence(timeout: 5))
    }

    @MainActor func testStorageLimitClearAndDownloadRemovalSurviveRestart() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-ui-test-library", "--ui-testing-storage"]
        app.launch()
        XCTAssertTrue(app.staticTexts["An offline test article"].waitForExistence(timeout: 15))
        openStorage(app)
        let picker = app.buttons["cacheLimit"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        XCTAssertTrue(picker.label.contains("200 MB"))
        XCTAssertFalse(app.staticTexts["cacheUsage"].label.contains("Zero"))
        picker.tap()
        app.buttons["500 MB"].tap()
        XCTAssertTrue(picker.label.contains("500 MB"))
        app.buttons["clearCache"].tap()
        XCTAssertTrue(app.staticTexts["Cache cleared. Downloaded text is still available offline."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["cacheUsage"].label.contains("Zero"))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Manage storage after clearing audio"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        reopen(app)
        XCTAssertTrue(app.staticTexts["1 saved offline · On this iPhone"].waitForExistence(timeout: 10))
        openStorage(app)
        XCTAssertTrue(app.buttons["cacheLimit"].label.contains("500 MB"))
        let remove = app.buttons["removeAllDownloads"]
        for _ in 0..<3 where !remove.isHittable { app.swipeUp() }
        remove.tap()
        app.buttons["Cancel"].tap()
        XCTAssertFalse(app.staticTexts["Cache and downloads removed. Your library and annotations are safe."].exists)
        remove.tap()
        app.buttons["Remove caches & downloads"].tap()
        XCTAssertTrue(app.staticTexts["Cache and downloads removed. Your library and annotations are safe."].waitForExistence(timeout: 5))
        reopen(app)
        XCTAssertTrue(app.staticTexts["0 saved offline · On this iPhone"].waitForExistence(timeout: 10))
        app.staticTexts["An offline test article"].tap()
        XCTAssertTrue(app.buttons["Download text"].waitForExistence(timeout: 5))
    }

    @MainActor func testLiveSpeechBackendPlayback() throws {
        guard ProcessInfo.processInfo.environment["NATIVE_SPEECH_LIVE_TEST"] == "1" else { throw XCTSkip("Live backend test is opt-in and needs a configured local server") }
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-ui-test-library", "--ui-testing-server"]
        app.launch()
        XCTAssertTrue(app.staticTexts["An offline test article"].waitForExistence(timeout: 15))
        app.staticTexts["An offline test article"].tap()
        XCTAssertTrue(app.buttons["Listen"].waitForExistence(timeout: 15))
        app.buttons["Listen"].tap()
        XCTAssertTrue(app.buttons["expandPlayer"].waitForExistence(timeout: 10))
        app.buttons["expandPlayer"].tap()
        let status = app.staticTexts["playbackStatus"]
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Playing"), object: status)], timeout: 30), .completed)
        XCTAssertFalse(app.otherElements["playbackError"].exists)
        app.buttons["playerPlayPause"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Paused"), object: status)], timeout: 3), .completed)
        app.buttons["playbackVoice"].tap()
        XCTAssertTrue(app.buttons["Alicia · Speechify"].waitForExistence(timeout: 5))
        app.buttons["Alicia · Speechify"].tap()
        XCTAssertEqual(status.label, "Paused")
        app.buttons["playerPlayPause"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Playing"), object: status)], timeout: 30), .completed)
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Live Speechify playback"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Done"].tap(); app.buttons["Close listening player"].tap()
    }

    @MainActor func testRealPCMRendererContinuesInBackgroundAndSeeks() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-ui-test-library", "--ui-testing-audio"]
        app.launch()
        XCTAssertTrue(app.staticTexts["An offline test article"].waitForExistence(timeout: 15))
        app.staticTexts["An offline test article"].tap()
        app.buttons["Listen"].tap()
        XCTAssertTrue(app.buttons["expandPlayer"].waitForExistence(timeout: 10))
        app.buttons["expandPlayer"].tap()
        let playing = app.staticTexts["playbackStatus"]
        XCTAssertTrue(NSPredicate(format: "label == %@", "Playing").evaluate(with: playing) || XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Playing"), object: playing)], timeout: 10) == .completed)
        app.buttons["playerPlayPause"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Paused"), object: playing)], timeout: 3), .completed, "Pause before background")
        app.buttons["playerPlayPause"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let before = app.staticTexts["playbackElapsed"].label
        XCUIDevice.shared.press(.home)
        // The audio session keeps its render clock running while the scene is inactive.
        let delay = expectation(description: "Background audio progresses")
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { delay.fulfill() }
        wait(for: [delay], timeout: 5)
        app.activate()
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertNotEqual(app.staticTexts["playbackElapsed"].label, before)
        XCTAssertEqual(playing.label, "Playing")
        app.buttons["playerPlayPause"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Paused"), object: playing)], timeout: 3), .completed)
        app.sliders["playbackPosition"].adjust(toNormalizedSliderPosition: 0.65)
        XCTAssertTrue(app.buttons["Pause audio"].waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
        app.buttons["Close listening player"].tap()
    }

    @MainActor func testJumpToSpokenTextReturnsFromScrolledPositionWithoutResuming() throws {
        let app = launchLongReader()
        app.buttons["startListening"].tap()
        XCTAssertTrue(app.buttons["Pause preview"].waitForExistence(timeout: 5))
        app.buttons["Pause preview"].tap()
        for _ in 0..<3 { app.swipeUp() }
        let jump = app.buttons["jumpToSpokenText"]
        XCTAssertTrue(jump.waitForExistence(timeout: 5))
        assertJumpIsAboveMiniPlayer(app)
        jump.tap()
        XCTAssertTrue(jump.waitForNonExistence(timeout: 5), "Jump must put the spoken text onscreen even when contentOffset is nonzero")
        XCTAssertTrue(app.buttons["Play preview"].exists, "Following text must preserve paused playback")
        app.swipeUp()
        XCTAssertTrue(jump.waitForExistence(timeout: 5), "Scrolling away must restore the control")
        assertJumpIsAboveMiniPlayer(app)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Spoken text above mini player"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["expandPlayer"].waitForExistence(timeout: 5), "The library must keep its mini player after leaving the reader")
        XCTAssertEqual(app.buttons.matching(identifier: "expandPlayer").count, 1)
        XCTAssertFalse(jump.exists)
        app.cells.containing(.staticText, identifier: "An offline test article").firstMatch.tap()
        XCTAssertTrue(app.buttons["expandPlayer"].waitForExistence(timeout: 5))
        app.buttons["expandPlayer"].tap()
        XCTAssertEqual(app.staticTexts["playbackStatus"].label, "Paused")
        app.buttons["Done"].tap()
    }

    @MainActor func testJumpToSpokenTextReturnsAfterFinishedPlaybackIsSeeked() throws {
        let app = launchLongReader()
        app.buttons["startListening"].tap()
        XCTAssertTrue(app.buttons["expandPlayer"].waitForExistence(timeout: 5))
        app.buttons["expandPlayer"].tap()
        let status = app.staticTexts["playbackStatus"]
        let position = app.sliders["playbackPosition"]
        func seekAndPause() {
            position.adjust(toNormalizedSliderPosition: 0.9)
            XCTAssertTrue(app.buttons["Pause preview"].waitForExistence(timeout: 5))
            app.buttons["playerPlayPause"].tap()
            XCTAssertEqual(status.label, "Paused")
            app.buttons["Done"].tap()
        }
        seekAndPause()
        let jump = app.buttons["jumpToSpokenText"]
        XCTAssertTrue(jump.waitForExistence(timeout: 5))
        app.buttons["expandPlayer"].tap()
        position.adjust(toNormalizedSliderPosition: 1)
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Finished"), object: status)], timeout: 10), .completed)
        app.buttons["Done"].tap()
        XCTAssertTrue(jump.waitForNonExistence(timeout: 5))
        app.buttons["expandPlayer"].tap()
        seekAndPause()
        XCTAssertTrue(jump.waitForExistence(timeout: 5), "Finishing must not erase the cached offscreen direction needed after seeking")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.cells.containing(.staticText, identifier: "An offline test article").firstMatch.tap()
        XCTAssertTrue(jump.waitForExistence(timeout: 5), "Reopening a paused article must restore the offscreen control")
        assertJumpIsAboveMiniPlayer(app)
        jump.tap()
        XCTAssertTrue(jump.waitForNonExistence(timeout: 5))
    }

    @MainActor private func assertJumpIsAboveMiniPlayer(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let jump = app.buttons["jumpToSpokenText"]
        let controls = [app.buttons["expandPlayer"], app.buttons["Play preview"], app.buttons["Close listening player"]]
        XCTAssertEqual(app.buttons.matching(identifier: "expandPlayer").count, 1, file: file, line: line)
        XCTAssertTrue(jump.isHittable, file: file, line: line)
        for control in controls {
            XCTAssertTrue(control.isHittable, file: file, line: line)
            XCTAssertLessThanOrEqual(jump.frame.maxY + 8, control.frame.minY, "Spoken-text button must sit above every mini-player control", file: file, line: line)
        }
    }

    @MainActor private func launchLongReader() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-ui-test-library", "--ui-testing-long-article"]
        app.launch()
        let article = app.staticTexts["An offline test article"]
        XCTAssertTrue(article.waitForExistence(timeout: 15))
        article.tap()
        return app
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
        // Safari's compact iOS 26 toolbar moves Share into the More menu.
        if !share.waitForExistence(timeout: 3), safari.buttons["MoreMenuButton"].exists {
            safari.buttons["MoreMenuButton"].tap()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 20))
        share.tap()
        let extensionButton = safari.cells["Paper Drive"]
        XCTAssertTrue(extensionButton.waitForExistence(timeout: 20))
        extensionButton.tap()
        XCTAssertTrue(safari.staticTexts["Link saved. Open Paper Drive to download the text."].waitForExistence(timeout: 10))
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
