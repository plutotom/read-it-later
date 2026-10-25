import XCTest
@testable import ReadingCore

final class SpokenTextScrollTests: XCTestCase {
    func testAnchorPrefersWordRangeThenFallsBackToChunk() {
        let word = NSRange(location: 120, length: 4)
        let chunk = NSRange(location: 80, length: 240)
        XCTAssertEqual(SpokenTextScroll.anchor(wordRange: word, chunkRange: chunk), SpokenTextAnchor(range: word, precision: .word))
        XCTAssertEqual(SpokenTextScroll.anchor(wordRange: nil, chunkRange: chunk), SpokenTextAnchor(range: chunk, precision: .chunk))
        XCTAssertEqual(SpokenTextScroll.anchor(wordRange: NSRange(location: 0, length: 0), chunkRange: chunk)?.precision, .chunk)
        XCTAssertNil(SpokenTextScroll.anchor(wordRange: nil, chunkRange: nil))
        XCTAssertNil(SpokenTextScroll.anchor(wordRange: NSRange(location: -1, length: 4), chunkRange: NSRange(location: 0, length: 0)))
    }

    func testButtonHidesWhenSpokenTextIsAlreadyOnScreen() {
        let visible = CGRect(x: 0, y: 100, width: 390, height: 500)
        let onScreen = CGRect(x: 16, y: 240, width: 200, height: 22)
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: onScreen, visibleBounds: visible), .hidden)
        XCTAssertFalse(SpokenTextScroll.shouldShowButton(sessionAllows: true, visibility: .hidden))
        XCTAssertTrue(SpokenTextScroll.shouldShowButton(sessionAllows: true, visibility: .visible(direction: .down)))
        XCTAssertFalse(SpokenTextScroll.shouldShowButton(sessionAllows: false, visibility: .visible(direction: .down)))
    }

    func testVisibilityUsesDirectionWhenSpokenTextIsOffScreen() {
        let visible = CGRect(x: 0, y: 80, width: 390, height: 520)
        let above = CGRect(x: 16, y: -400, width: 220, height: 24)
        let below = CGRect(x: 16, y: 2400, width: 220, height: 24)
        let clippedTop = CGRect(x: 16, y: 70, width: 220, height: 18)
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: above, visibleBounds: visible), .visible(direction: .up))
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: below, visibleBounds: visible), .visible(direction: .down))
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: clippedTop, visibleBounds: visible), .visible(direction: .up))
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: .null, visibleBounds: visible), .hidden)
        XCTAssertEqual(SpokenTextScroll.visibility(spokenRectInVisibleBounds: above, visibleBounds: .zero), .hidden)
    }

    func testTargetOffsetPlacesSpokenTextNearTheTopWithContext() {
        // UIKit conversion returns content Y, even when the reader is already scrolled.
        let offset = SpokenTextScroll.targetOffsetY(
            spokenMinYInScrollContent: 1500,
            topInset: 48,
            minOffsetY: -48,
            maxOffsetY: 4000
        )
        XCTAssertEqual(offset, 1396)
        let visible = CGRect(x: 0, y: offset + 48, width: 390, height: 600)
        XCTAssertEqual(SpokenTextScroll.visibility(
            spokenRectInVisibleBounds: CGRect(x: 16, y: 1500, width: 100, height: 22),
            visibleBounds: visible
        ), .hidden)
    }

    func testTargetOffsetClampsToContentBoundsOnLongAndShortArticles() {
        let pastEnd = SpokenTextScroll.targetOffsetY(
            spokenMinYInScrollContent: 9000,
            topInset: 0,
            minOffsetY: 0,
            maxOffsetY: 3200
        )
        XCTAssertEqual(pastEnd, 3200)

        let beforeStart = SpokenTextScroll.targetOffsetY(
            spokenMinYInScrollContent: -200,
            topInset: 47,
            minOffsetY: -47,
            maxOffsetY: 1800
        )
        XCTAssertEqual(beforeStart, -47)

        let shortArticle = SpokenTextScroll.targetOffsetY(
            spokenMinYInScrollContent: 400,
            topInset: 0,
            minOffsetY: 0,
            maxOffsetY: 0
        )
        XCTAssertEqual(shortArticle, 0)
    }
}

extension SpokenTextScrollTests {
    @MainActor func testPlayerReportsWordAnchorsAndIgnoresOtherArticles() async {
        let document = ListeningDocument(articleID: "article", title: "Test", text: "First paragraph here.\n\nSecond paragraph here.")
        let player = ListeningPlayer(service: ImmediateWordService(), transport: ManualWordTransport(), automaticallyTick: false)
        XCTAssertNil(player.spokenTextAnchor(forArticleID: "article"))
        player.start(document, paragraph: 1)
        await waitUntil { player.state == .playing }
        XCTAssertEqual(player.spokenTextAnchor(forArticleID: "article")?.precision, .word)
        XCTAssertEqual(player.spokenTextAnchor(forArticleID: "article")?.range.location, document.chunks[1].range.location)
        XCTAssertNil(player.spokenTextAnchor(forArticleID: "other"))
        player.pause()
        XCTAssertEqual(player.spokenTextAnchor(forArticleID: "article")?.precision, .word)
        player.close()
        XCTAssertNil(player.spokenTextAnchor(forArticleID: "article"))
    }

    @MainActor func testPlayerFallsBackToChunkAndAllowsFollowAfterFinishingAndSeeking() async {
        let document = ListeningDocument(articleID: "article", title: "Test", text: "First paragraph.\n\nLast paragraph.")
        let transport = ManualWordTransport()
        let player = ListeningPlayer(service: ImmediateWordService(includeWords: false), transport: transport, automaticallyTick: false)
        let offscreen = SpokenTextFollowVisibility.visible(direction: .down)
        player.start(document, paragraph: 1)
        await waitUntil { player.state == .playing }
        XCTAssertEqual(player.spokenTextAnchor(forArticleID: "article"), SpokenTextAnchor(range: document.chunks[1].range, precision: .chunk))
        transport.position = 8
        player.tick()
        XCTAssertEqual(player.state, .finished)
        XCTAssertFalse(SpokenTextScroll.shouldShowButton(sessionAllows: player.spokenTextAnchor(forArticleID: "article") != nil, visibility: offscreen))
        player.seek(to: player.total - 1)
        await waitUntil { player.state == .playing }
        XCTAssertTrue(SpokenTextScroll.shouldShowButton(sessionAllows: player.spokenTextAnchor(forArticleID: "article") != nil, visibility: offscreen))
        player.close()
    }

    @MainActor private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<2000 {
            if condition() { return }
            try? await Task.sleep(for: .milliseconds(1))
        }
        XCTFail("Condition did not become true")
    }
}

private actor ImmediateWordService: SpeechService {
    let includeWords: Bool
    init(includeWords: Bool = true) { self.includeWords = includeWords }
    nonisolated let voices = [SpeechVoice(id: "a", name: "A", language: "en")]
    nonisolated let configurationID = "spoken-anchor-test"
    func generate(_ request: SpeechRequest) async throws -> SpeechResponse {
        let first = try NSRegularExpression(pattern: #"\S+"#).firstMatch(in: request.text, range: NSRange(location: 0, length: request.text.utf16.count))!.range
        return SpeechResponse(audio: .simulated, duration: 8, marks: includeWords ? [SpeechMark(range: first, start: 0, end: 8)] : [])
    }
}

@MainActor private final class ManualWordTransport: SpeechTransport {
    var position = 0.0
    var failureMessage: String?
    func load(_ response: SpeechResponse, at time: TimeInterval) throws { position = time }
    func play(rate: Double) {}
    func pause() {}
    func unload() { position = 0 }
    func seek(to time: TimeInterval) { position = time }
}
