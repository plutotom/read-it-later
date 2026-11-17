import Foundation

/// Local playback tempo. Speech is always synthesized at 1×; this never belongs on `SpeechRequest`.
///
/// `AVAudioUnitTimePitch.rate` time-stretches while `pitch` stays at 0 cents. That is not varispeed:
/// do not also shift pitch, and do not send a provider `speakingRate`. Default TimePitch overlap (8)
/// and 24 kHz TTS make faster rates sound chipmunk-like or warbly, so the renderer runs TimePitch
/// at 48 kHz with maximum overlap and bypasses it at 1×.
public struct ListeningPlaybackRate: Equatable, Sendable {
    public static let minimum = 0.5
    public static let maximum = 3.0
    public static let unity = 1.0
    public static let sourceSampleRate: Double = 24_000
    public static let timeStretchSampleRate: Double = 48_000
    /// `AVAudioUnitTimePitch.overlap` range is 3...32. Higher overlap is smoother on speech.
    public static let overlap: Float = 32
    /// Cents. Zero keeps the synthesized voice; TimePitch.rate already preserves pitch.
    public static let pitchCents: Float = 0

    public let value: Double
    public var timePitchRate: Float { Float(value) }
    public var bypassesTimeStretch: Bool { abs(value - Self.unity) < 0.001 }

    public init(_ value: Double) {
        guard value.isFinite else { self.value = Self.unity; return }
        self.value = min(Self.maximum, max(Self.minimum, value))
    }
}
