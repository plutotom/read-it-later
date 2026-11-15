import XCTest
@testable import ReadingCore

final class NarrationAudioSessionTests: XCTestCase {
    func testLaunchBrowsePrefetchAndPauseDoNotTakeAudioFocus() {
        let policy = NarrationAudioSessionPolicy.standard
        for event: NarrationAudioSessionPolicy.Event in [.initialize, .prefetch, .pause] {
            XCTAssertFalse(policy.shouldCreateAudioGraph(for: event), "\(event) must not build AVAudioEngine")
            XCTAssertFalse(policy.shouldActivate(for: event), "\(event) must not activate AVAudioSession")
            XCTAssertFalse(policy.shouldDeactivate(for: event), "\(event) must leave a live session for lock-screen pause")
        }
    }

    func testExplicitPlayCreatesGraphAndActivatesExclusivePlayback() {
        let policy = NarrationAudioSessionPolicy.standard
        XCTAssertEqual(policy.category, "playback")
        XCTAssertEqual(policy.mode, "spokenAudio")
        XCTAssertEqual(policy.options, [], "Playback-only sessions must not set AirPlay/A2DP flags (PR #25)")
        XCTAssertFalse(policy.options.contains("mixWithOthers"), "Narration must not mix with Music; take focus only after Play")
        XCTAssertTrue(policy.shouldCreateAudioGraph(for: .play))
        XCTAssertTrue(policy.shouldActivate(for: .play))
        XCTAssertFalse(policy.shouldDeactivate(for: .play))
    }

    func testUnloadReleasesAudioFocusAndNotifyOthers() {
        let policy = NarrationAudioSessionPolicy.standard
        XCTAssertFalse(policy.shouldCreateAudioGraph(for: .unload))
        XCTAssertFalse(policy.shouldActivate(for: .unload))
        XCTAssertTrue(policy.shouldDeactivate(for: .unload))
    }
}
