import XCTest
@testable import ReadingCore

final class ListeningPlaybackRateTests: XCTestCase {
    func testUnityBypassesTimePitchAndHoldsPitchAtZero() {
        let rate = ListeningPlaybackRate(1)
        XCTAssertEqual(rate.value, 1)
        XCTAssertEqual(rate.timePitchRate, 1)
        XCTAssertTrue(rate.bypassesTimeStretch)
        XCTAssertEqual(ListeningPlaybackRate.pitchCents, 0)
        XCTAssertEqual(ListeningPlaybackRate.overlap, 32)
        XCTAssertEqual(ListeningPlaybackRate.sourceSampleRate, 24_000)
        XCTAssertEqual(ListeningPlaybackRate.timeStretchSampleRate, 48_000)
        XCTAssertGreaterThan(ListeningPlaybackRate.timeStretchSampleRate, ListeningPlaybackRate.sourceSampleRate)
    }

    func testFasterRatesStretchTimeWithoutPitchCompensation() {
        for value in [0.5, 0.8, 1.25, 1.5, 2, 2.5, 3] as [Double] {
            let rate = ListeningPlaybackRate(value)
            XCTAssertEqual(rate.value, value)
            XCTAssertEqual(rate.timePitchRate, Float(value))
            XCTAssertEqual(ListeningPlaybackRate.pitchCents, 0, "TimePitch.rate preserves pitch; cents must stay 0 at \(value)×")
            XCTAssertEqual(rate.bypassesTimeStretch, value == 1)
        }
    }

    func testClampsOutOfRangeAndMapsNonFiniteToUnity() {
        XCTAssertEqual(ListeningPlaybackRate(0.25).value, 0.5)
        XCTAssertEqual(ListeningPlaybackRate(4).value, 3)
        XCTAssertEqual(ListeningPlaybackRate(.nan).value, 1)
        XCTAssertEqual(ListeningPlaybackRate(.infinity).value, 1)
        XCTAssertTrue(ListeningPlaybackRate(1.0000000001).bypassesTimeStretch)
        XCTAssertFalse(ListeningPlaybackRate(1.25).bypassesTimeStretch)
    }

    func testSpeechRequestIdentityDoesNotIncludePlaybackSpeed() {
        let voice = SpeechVoice(id: "a", name: "A", language: "en", descriptor: SpeechDescriptor(provider: "google", model: "chirp", voice: "a", normalization: "server-owned-v1", synthesisRate: 1))
        let slow = SpeechRequest(text: "Hello.", voice: voice, configurationID: "account-listening-pcm24-v1", segment: SpeechSegmentIdentity(articleId: "id", revision: "r", segment: 0))
        let fast = SpeechRequest(text: "Hello.", voice: voice, configurationID: "account-listening-pcm24-v1", segment: SpeechSegmentIdentity(articleId: "id", revision: "r", segment: 0))
        XCTAssertEqual(slow, fast)
        XCTAssertEqual(SpeechDiskCache.key(slow), SpeechDiskCache.key(fast))
        XCTAssertEqual(voice.descriptor?.synthesisRate, 1)
    }
}
