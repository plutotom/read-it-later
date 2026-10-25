import Foundation

/// Best available spoken-text range in the original article, using UTF-16 offsets.
public struct SpokenTextAnchor: Equatable, Sendable {
    public enum Precision: String, Sendable { case word, chunk }
    public let range: NSRange
    public let precision: Precision
    public init(range: NSRange, precision: Precision) {
        self.range = range
        self.precision = precision
    }
}

/// Whether the spoken range is already on screen, or which way the reader must jump.
public enum SpokenTextFollowVisibility: Equatable, Sendable {
    case hidden
    case visible(direction: Direction)
    public enum Direction: String, Sendable { case up, down }
}

/// Maps listening playback position onto article-text scroll geometry.
///
/// Position comes from the player's word highlight when word timings exist, otherwise
/// the current listening chunk (paragraph/section). Google Chirp currently supplies
/// paragraph timing only; Speechify/Inworld and the silent preview can supply words.
public enum SpokenTextScroll {
    public static let contextAbove: CGFloat = 56
    public static let minimumVisibleHeight: CGFloat = 28

    /// Prefers the spoken-word highlight; falls back to the current chunk.
    public static func anchor(wordRange: NSRange?, chunkRange: NSRange?) -> SpokenTextAnchor? {
        if let wordRange, wordRange.location >= 0, wordRange.length > 0 {
            return SpokenTextAnchor(range: wordRange, precision: .word)
        }
        if let chunkRange, chunkRange.location >= 0, chunkRange.length > 0 {
            return SpokenTextAnchor(range: chunkRange, precision: .chunk)
        }
        return nil
    }

    public static func shouldShowButton(sessionAllows: Bool, visibility: SpokenTextFollowVisibility) -> Bool {
        sessionAllows && visibility != .hidden
    }

    /// `spokenRectInVisibleBounds` is the spoken highlight in the same coordinate space as `visibleBounds`.
    public static func visibility(
        spokenRectInVisibleBounds: CGRect,
        visibleBounds: CGRect,
        minimumVisibleHeight: CGFloat = minimumVisibleHeight
    ) -> SpokenTextFollowVisibility {
        guard spokenRectInVisibleBounds.isFinite, visibleBounds.isFinite, !visibleBounds.isEmpty else {
            return .hidden
        }
        if spokenRectInVisibleBounds.isNull || spokenRectInVisibleBounds.isInfinite {
            return .hidden
        }
        let intersection = visibleBounds.intersection(spokenRectInVisibleBounds)
        let visibleHeight = intersection.isNull ? 0 : intersection.height
        let needed = min(max(spokenRectInVisibleBounds.height, 1), minimumVisibleHeight)
        if visibleHeight >= needed {
            return .hidden
        }
        if spokenRectInVisibleBounds.maxY <= visibleBounds.minY {
            return .visible(direction: .up)
        }
        if spokenRectInVisibleBounds.minY >= visibleBounds.maxY {
            return .visible(direction: .down)
        }
        return spokenRectInVisibleBounds.midY < visibleBounds.midY
            ? .visible(direction: .up)
            : .visible(direction: .down)
    }

    /// Takes the absolute content coordinate returned by converting the text rect into the scroll view.
    /// The current content offset is already represented by the scroll view's bounds origin.
    public static func targetOffsetY(
        spokenMinYInScrollContent: CGFloat,
        topInset: CGFloat,
        contextAbove: CGFloat = contextAbove,
        minOffsetY: CGFloat,
        maxOffsetY: CGFloat
    ) -> CGFloat {
        let desiredMinY = topInset + contextAbove
        let target = spokenMinYInScrollContent - desiredMinY
        if maxOffsetY <= minOffsetY { return minOffsetY }
        return min(max(target, minOffsetY), maxOffsetY)
    }
}

private extension CGRect {
    var isFinite: Bool {
        origin.x.isFinite && origin.y.isFinite && size.width.isFinite && size.height.isFinite
    }
}
