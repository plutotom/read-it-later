/// When Paper Drive may create an AVAudioEngine or activate AVAudioSession.
/// Launch, library browsing, and reading must not take audio focus; explicit Play may.
public struct NarrationAudioSessionPolicy: Equatable, Sendable {
    public enum Event: String, Sendable {
        case initialize
        case prefetch
        case play
        case pause
        case unload
    }

    public static let standard = NarrationAudioSessionPolicy()

    /// Matches `AVAudioSession.Category.playback`. Stored as a name so tests need no AVFoundation.
    public let category = "playback"
    /// Matches `AVAudioSession.Mode.spokenAudio`.
    public let mode = "spokenAudio"
    /// Must stay empty. `allowAirPlay` / `allowBluetoothA2DP` are playAndRecord-only and fail with -50 on iPhone.
    public let options: [String] = []

    public init() {}

    public func shouldCreateAudioGraph(for event: Event) -> Bool { event == .play }
    public func shouldActivate(for event: Event) -> Bool { event == .play }
    public func shouldDeactivate(for event: Event) -> Bool { event == .unload }
}
