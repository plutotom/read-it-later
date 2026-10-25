import XCTest
@testable import ReadingCore

@MainActor final class ListeningPreparationTests: XCTestCase {
    func testDelayedPreparationCannotRestartAfterCloseOrReplaceAnotherArticle() async throws {
        let player = ListeningPlayer(automaticallyTick: false)
        let a = ListeningDocument(articleID: "A", title: "A", text: "The first article is waiting for its metadata.")
        let b = ListeningDocument(articleID: "B", title: "B", text: "The second article is the user's latest choice.")
        let pendingA = player.beginPreparation()
        player.close()
        player.start(a, expectedIntent: pendingA)
        XCTAssertNil(player.document)
        XCTAssertEqual(player.cachedChunkCount, 0)
        let anotherA = player.beginPreparation()
        let selectedB = player.beginPreparation()
        player.start(b, expectedIntent: selectedB)
        player.start(a, expectedIntent: anotherA)
        XCTAssertEqual(player.document?.articleID, "B")
        player.close()
    }

    func testServiceConfigurationRetainsOnlyItsOwnValidPreparationIntent() {
        let player = ListeningPlayer(automaticallyTick: false)
        let first = player.beginPreparation()
        player.configure(service: SimulatedSpeechService(), transport: SimulatedSpeechTransport(), expectedIntent: first)
        XCTAssertEqual(player.intentToken, first)
        player.cancelPreparation(first)
        let canceled = player.intentToken
        player.configure(service: SimulatedSpeechService(), transport: SimulatedSpeechTransport(), expectedIntent: first)
        XCTAssertEqual(player.intentToken, canceled)
        let latest = player.beginPreparation()
        player.cancelPreparation(first)
        XCTAssertEqual(player.intentToken, latest)
    }
}
