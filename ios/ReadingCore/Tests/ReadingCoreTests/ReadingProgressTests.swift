import XCTest
@testable import ReadingCore

final class ReadingProgressTests: XCTestCase {
    func testProgressIsRelativeToScrollableRange() {
        XCTAssertEqual(ReadingProgress.progress(offsetY: 0, minOffsetY: 0, maxOffsetY: 1000), 0)
        XCTAssertEqual(ReadingProgress.progress(offsetY: 250, minOffsetY: 0, maxOffsetY: 1000), 0.25)
        XCTAssertEqual(ReadingProgress.progress(offsetY: 1000, minOffsetY: 0, maxOffsetY: 1000), 1)
        XCTAssertEqual(ReadingProgress.progress(offsetY: 200, minOffsetY: -48, maxOffsetY: 352), 0.62, accuracy: 0.001)
        XCTAssertEqual(ReadingProgress.progress(offsetY: 10, minOffsetY: 0, maxOffsetY: 0), 0)
        XCTAssertEqual(ReadingProgress.progress(offsetY: .infinity, minOffsetY: 0, maxOffsetY: 100), 0)
    }

    func testOffsetFromProgressSurvivesInsetsAndClamps() {
        XCTAssertEqual(ReadingProgress.offsetY(progress: 0, minOffsetY: -48, maxOffsetY: 1952), -48)
        XCTAssertEqual(ReadingProgress.offsetY(progress: 1, minOffsetY: -48, maxOffsetY: 1952), 1952)
        XCTAssertEqual(ReadingProgress.offsetY(progress: 0.5, minOffsetY: 0, maxOffsetY: 800), 400)
        XCTAssertEqual(ReadingProgress.offsetY(progress: 2, minOffsetY: 0, maxOffsetY: 800), 800)
        XCTAssertEqual(ReadingProgress.offsetY(progress: .nan, minOffsetY: 0, maxOffsetY: 800), 0)
        XCTAssertEqual(ReadingProgress.offsetY(progress: 0.4, minOffsetY: 0, maxOffsetY: 0), 0)
    }

    func testRoundTripProgressAfterRotationUsesFractionNotPixels() {
        let portrait = ReadingProgress.progress(offsetY: 1200, minOffsetY: 0, maxOffsetY: 4000)
        let landscape = ReadingProgress.offsetY(progress: portrait, minOffsetY: 0, maxOffsetY: 1800)
        XCTAssertEqual(landscape, 540)
        XCTAssertNotEqual(landscape, 1200)
    }

    func testResolvePrefersUTF16WhenHashMatchesAndFallsBackToFraction() {
        let text = "First paragraph.\n\nSecond paragraph that is longer."
        let saved = ReadingPosition(
            articleId: "a",
            contentHash: "original",
            utf16Offset: 24,
            progress: 0.41
        )
        XCTAssertEqual(
            ReadingProgress.resolve(saved: saved, currentHash: "original", utf16Count: text.utf16.count),
            .utf16Offset(24)
        )
        XCTAssertEqual(
            ReadingProgress.resolve(saved: saved, currentHash: "edited", utf16Count: text.utf16.count + 6),
            .fraction(0.41)
        )
        XCTAssertEqual(
            ReadingProgress.resolve(saved: saved, currentHash: "original", utf16Count: 0),
            .fraction(0.41)
        )
        XCTAssertNil(ReadingProgress.resolve(
            saved: ReadingPosition(articleId: "a", contentHash: "x", utf16Offset: 0, progress: 0),
            currentHash: "y",
            utf16Count: 0
        ))
    }

    func testTextIdentityUsesExactBytesForUTF16Anchors() {
        let first = "Caf\u{00E9}"
        let decomposed = "Cafe\u{0301}"
        XCTAssertEqual(first, decomposed)
        XCTAssertTrue(ReadingProgress.matchesText(first, first))
        XCTAssertFalse(ReadingProgress.matchesText(first, decomposed))
        XCTAssertFalse(ReadingProgress.matchesText("First line", "Other line"))
        let longText = String(repeating: first, count: 200)
        XCTAssertTrue(ReadingProgress.matchesText(longText, String(decoding: Array(longText.utf8), as: UTF8.self)))
    }

    func testResolveKeepsTopAndBottomIncludingReaderHeaderAndFooter() {
        let top = ReadingPosition(articleId: "a", contentHash: "hash", utf16Offset: 0, progress: 0)
        let bottom = ReadingPosition(articleId: "a", contentHash: "hash", utf16Offset: 82, progress: 1)
        XCTAssertEqual(ReadingProgress.resolve(saved: top, currentHash: "hash", utf16Count: 100), .fraction(0))
        XCTAssertEqual(ReadingProgress.resolve(saved: bottom, currentHash: "hash", utf16Count: 100), .fraction(1))
    }

    func testResolveClampsUTF16OffsetToCurrentText() {
        let saved = ReadingPosition(articleId: "a", contentHash: "hash", utf16Offset: 9_999, progress: 0.9)
        XCTAssertEqual(ReadingProgress.resolve(saved: saved, currentHash: "hash", utf16Count: 12), .utf16Offset(11))
        XCTAssertEqual(ReadingProgress.clampedUTF16Offset(-4, count: 12), 0)
        XCTAssertEqual(ReadingProgress.clampedUTF16Offset(0, count: 0), 0)
    }

    func testThrottleRequiresIntervalUnlessForced() {
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(ReadingProgress.shouldPersist(previous: nil, now: start))
        XCTAssertFalse(ReadingProgress.shouldPersist(previous: start, now: start.addingTimeInterval(0.2)))
        XCTAssertTrue(ReadingProgress.shouldPersist(previous: start, now: start.addingTimeInterval(0.4)))
        XCTAssertTrue(ReadingProgress.shouldPersist(previous: start, now: start.addingTimeInterval(0.1), force: true))
    }

    func testMeaningfulChangeIgnoresJitterBelowEpsilon() {
        let first = ReadingPosition(articleId: "a", contentHash: "h", utf16Offset: 80, progress: 0.5)
        let jitter = ReadingPosition(articleId: "a", contentHash: "h", utf16Offset: 80, progress: 0.501)
        let moved = ReadingPosition(articleId: "a", contentHash: "h", utf16Offset: 81, progress: 0.5)
        XCTAssertFalse(ReadingProgress.isMeaningfulChange(jitter, from: first))
        XCTAssertTrue(ReadingProgress.isMeaningfulChange(moved, from: first))
        XCTAssertTrue(ReadingProgress.isMeaningfulChange(first, from: nil))
    }

    func testProgressChangesAtAnEdgeEvenWithinEpsilon() {
        XCTAssertTrue(ReadingProgress.progressChanged(0, from: 0.001))
        XCTAssertTrue(ReadingProgress.progressChanged(0.001, from: 0))
        XCTAssertTrue(ReadingProgress.progressChanged(1, from: 0.999))
        XCTAssertFalse(ReadingProgress.progressChanged(1, from: 1))
    }

    func testTargetOffsetPlacesAnchorNearTopThenClamps() {
        let mid = ReadingProgress.targetOffsetY(
            anchorMinYInScrollContent: 1500,
            topInset: 48,
            minOffsetY: -48,
            maxOffsetY: 4000
        )
        XCTAssertEqual(mid, 1444)
        XCTAssertEqual(
            ReadingProgress.targetOffsetY(anchorMinYInScrollContent: 9000, topInset: 0, minOffsetY: 0, maxOffsetY: 3200),
            3200
        )
        XCTAssertEqual(
            ReadingProgress.targetOffsetY(anchorMinYInScrollContent: 4, topInset: 47, minOffsetY: -47, maxOffsetY: 1800),
            -47
        )
    }

    func testReflowKeepsTheSameTextAboveChangingBottomChrome() {
        let portrait = ReadingProgress.scrollRange(contentHeight: 4000, boundsHeight: 700, topInset: 48, bottomInset: 80)
        let wider = ReadingProgress.scrollRange(contentHeight: 3000, boundsHeight: 440, topInset: 12, bottomInset: 125)
        let firstY = ReadingProgress.targetOffsetY(
            anchorMinYInScrollContent: 1600, topInset: 48, minOffsetY: portrait.min, maxOffsetY: portrait.max
        )
        let reflowedY = ReadingProgress.targetOffsetY(
            anchorMinYInScrollContent: 900, topInset: 12, minOffsetY: wider.min, maxOffsetY: wider.max
        )
        XCTAssertEqual(1600 - firstY - 48, ReadingProgress.restoreContextAbove)
        XCTAssertEqual(900 - reflowedY - 12, ReadingProgress.restoreContextAbove)
        XCTAssertNotEqual(
            ReadingProgress.progress(offsetY: firstY, minOffsetY: portrait.min, maxOffsetY: portrait.max),
            ReadingProgress.progress(offsetY: reflowedY, minOffsetY: wider.min, maxOffsetY: wider.max)
        )
    }

    func testLayoutReadinessWaitsForTextReflowAndParentLayout() {
        let textFrame = CGRect(x: 24, y: 180, width: 310, height: 320)
        XCTAssertTrue(ReadingProgress.layoutMatches(textFrame: textFrame, fittedHeight: 320, contentHeight: 560))
        XCTAssertFalse(ReadingProgress.layoutMatches(textFrame: textFrame, fittedHeight: 450, contentHeight: 560))
        XCTAssertFalse(ReadingProgress.layoutMatches(textFrame: textFrame, fittedHeight: 210, contentHeight: 560))
        XCTAssertFalse(ReadingProgress.layoutMatches(textFrame: textFrame, fittedHeight: 320, contentHeight: 490))
        XCTAssertFalse(ReadingProgress.layoutMatches(textFrame: .zero, fittedHeight: 320, contentHeight: 560))
    }

    func testScrollRangeMatchesUIKitContentOffsetLimits() {
        let range = ReadingProgress.scrollRange(contentHeight: 4000, boundsHeight: 700, topInset: 48, bottomInset: 80)
        XCTAssertEqual(range.min, -48)
        XCTAssertEqual(range.max, 3380)
        let short = ReadingProgress.scrollRange(contentHeight: 400, boundsHeight: 700, topInset: 48, bottomInset: 0)
        XCTAssertEqual(short.min, -48)
        XCTAssertEqual(short.max, -48)
    }

    @MainActor func testReadingPositionPersistsAcrossRelaunchAndIgnoresUnknownArticles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path)
        let article = try library.saveURL("https://example.com/long-read")
        let text = "Opening.\n\n" + String(repeating: "A later paragraph for the reader. ", count: 40)
        try library.saveContent(id: article.id, title: "Long", text: text)
        let position = ReadingPosition(
            articleId: article.id,
            contentHash: Highlight.contentHash(text),
            utf16Offset: 240,
            progress: 0.37
        )
        XCTAssertTrue(try library.saveReadingPosition(position))
        XCTAssertFalse(try library.saveReadingPosition(
            ReadingPosition(articleId: "missing", contentHash: "x", utf16Offset: 1, progress: 1)
        ))
        let reopened = try Library(path: path)
        let restored = try XCTUnwrap(reopened.readingPosition(articleId: article.id))
        XCTAssertEqual(restored.utf16Offset, 240)
        XCTAssertEqual(restored.progress, 0.37, accuracy: 0.0001)
        XCTAssertEqual(restored.contentHash, Highlight.contentHash(text))
        XCTAssertNil(try reopened.readingPosition(articleId: "missing"))
        try reopened.delete(id: article.id)
        XCTAssertNil(try reopened.readingPosition(articleId: article.id))
        XCTAssertNil(try Library(path: path).readingPosition(articleId: article.id))
    }

    @MainActor func testReadingPositionSurvivesDownloadRemovalAndUsesFractionAfterRewrite() throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/keep-place")
        let original = "First block.\n\nSecond block that we leave from."
        try library.saveContent(id: article.id, title: "Keep", text: original)
        try library.saveReadingPosition(ReadingPosition(
            articleId: article.id,
            contentHash: Highlight.contentHash(original),
            utf16Offset: 20,
            progress: 0.6
        ))
        try library.removeDownloads()
        let afterCleanup = try XCTUnwrap(library.readingPosition(articleId: article.id))
        XCTAssertEqual(afterCleanup.utf16Offset, 20)
        let rewritten = "Brand new article text that replaced the download."
        try library.saveContent(id: article.id, title: "Keep", text: rewritten)
        let saved = try XCTUnwrap(library.readingPosition(articleId: article.id))
        XCTAssertEqual(
            ReadingProgress.resolve(saved: saved, currentHash: Highlight.contentHash(rewritten), utf16Count: rewritten.utf16.count),
            .fraction(0.6)
        )
    }
}
