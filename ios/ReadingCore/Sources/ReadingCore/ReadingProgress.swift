import Foundation
import GRDB

/// Per-article reading location. Use `utf16Offset` in unchanged text and `progress`
/// at the scroll edges or after a text replacement.
public struct ReadingPosition: Codable, FetchableRecord, Equatable, Sendable {
    public static let databaseTableName = "reading_position"
    public var articleId: String
    public var contentHash: String
    public var utf16Offset: Int
    public var progress: Double
    public var updatedAt: Date

    public init(articleId: String, contentHash: String, utf16Offset: Int, progress: Double, updatedAt: Date = Date()) {
        self.articleId = articleId
        self.contentHash = contentHash
        self.utf16Offset = max(0, utf16Offset)
        self.progress = Self.clampedProgress(progress)
        self.updatedAt = updatedAt
    }

    public static func clampedProgress(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(1, max(0, value))
    }
}

/// How to put the reader back: a character in the current text, or a relative scroll fraction.
public enum ReadingProgressAnchor: Equatable, Sendable {
    case utf16Offset(Int)
    case fraction(Double)
}

/// Maps reader scroll geometry onto a durable per-article location.
///
/// Listening playback keeps its own `speech-bookmark-` records. Reading position is independent
/// so scrolling while audio continues (or vice versa) cannot jump the other.
public enum ReadingProgress {
    public static let persistInterval: TimeInterval = 0.4
    public static let progressEpsilon = 0.002
    public static let restoreContextAbove: CGFloat = 8

    public static func progress(offsetY: CGFloat, minOffsetY: CGFloat, maxOffsetY: CGFloat) -> Double {
        let span = maxOffsetY - minOffsetY
        guard span > 0, offsetY.isFinite, minOffsetY.isFinite, maxOffsetY.isFinite else { return 0 }
        return ReadingPosition.clampedProgress(Double((offsetY - minOffsetY) / span))
    }

    public static func offsetY(progress: Double, minOffsetY: CGFloat, maxOffsetY: CGFloat) -> CGFloat {
        let clamped = ReadingPosition.clampedProgress(progress)
        if !minOffsetY.isFinite || !maxOffsetY.isFinite { return 0 }
        if maxOffsetY <= minOffsetY { return minOffsetY }
        return minOffsetY + CGFloat(clamped) * (maxOffsetY - minOffsetY)
    }

    public static func clampedUTF16Offset(_ offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return min(max(0, offset), count - 1)
    }

    public static func shouldPersist(
        previous: Date?,
        now: Date,
        interval: TimeInterval = persistInterval,
        force: Bool = false
    ) -> Bool {
        if force { return true }
        guard let previous else { return true }
        return now >= previous.addingTimeInterval(interval)
    }

    public static func isMeaningfulChange(_ next: ReadingPosition, from previous: ReadingPosition?) -> Bool {
        guard let previous else { return true }
        if next.articleId != previous.articleId || next.contentHash != previous.contentHash { return true }
        if next.utf16Offset != previous.utf16Offset { return true }
        return progressChanged(next.progress, from: previous.progress)
    }

    public static func progressChanged(_ progress: Double, from previous: Double) -> Bool {
        edge(at: progress) != edge(at: previous) || abs(progress - previous) >= progressEpsilon
    }

    /// Hashes and UTF-16 offsets refer to the exact text, including its Unicode representation.
    public static func matchesText(_ first: String, _ second: String) -> Bool {
        let contiguousMatch = first.utf8.withContiguousStorageIfAvailable { left in
            second.utf8.withContiguousStorageIfAvailable { right in
                left.count == right.count && (left.baseAddress == right.baseAddress || left.elementsEqual(right))
            }
        }.flatMap { $0 }
        return contiguousMatch ?? first.utf8.elementsEqual(second.utf8)
    }

    /// Keep the scroll edges and prefer the UTF-16 character within unchanged text.
    public static func resolve(saved: ReadingPosition, currentHash: String, utf16Count: Int) -> ReadingProgressAnchor? {
        let fraction = ReadingPosition.clampedProgress(saved.progress)
        if utf16Count <= 0 { return fraction > 0 ? .fraction(fraction) : nil }
        if let edge = edge(at: fraction) { return .fraction(edge) }
        if saved.contentHash == currentHash {
            return .utf16Offset(clampedUTF16Offset(saved.utf16Offset, count: utf16Count))
        }
        return .fraction(fraction)
    }

    public static func scrollRange(
        contentHeight: CGFloat,
        boundsHeight: CGFloat,
        topInset: CGFloat,
        bottomInset: CGFloat
    ) -> (min: CGFloat, max: CGFloat) {
        let minOffset = -topInset
        let maxOffset = max(minOffset, contentHeight - boundsHeight + bottomInset)
        return (minOffset, maxOffset)
    }

    /// Places the saved character near the top of the visible reader, then clamps to content.
    public static func targetOffsetY(
        anchorMinYInScrollContent: CGFloat,
        topInset: CGFloat,
        minOffsetY: CGFloat,
        maxOffsetY: CGFloat,
        contextAbove: CGFloat = restoreContextAbove
    ) -> CGFloat {
        SpokenTextScroll.targetOffsetY(
            spokenMinYInScrollContent: anchorMinYInScrollContent,
            topInset: topInset,
            contextAbove: contextAbove,
            minOffsetY: minOffsetY,
            maxOffsetY: maxOffsetY
        )
    }

    /// The measured text must fit its assigned frame, and that frame must belong to the
    /// enclosing scroll view's current content layout. A short article can fit entirely onscreen.
    public static func layoutMatches(textFrame: CGRect, fittedHeight: CGFloat, contentHeight: CGFloat) -> Bool {
        textFrame.width > 0 && fittedHeight > 0
            && abs(textFrame.height - fittedHeight) <= 1
            && textFrame.maxY <= contentHeight + 1
    }

    private static func edge(at progress: Double) -> Double? {
        if progress == 0 || progress == 1 { return progress }
        return nil
    }
}

extension Library {
    static func registerReadingPositionMigration(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v9-reading-position") { db in
            try db.execute(sql: """
                CREATE TABLE reading_position (
                    articleId TEXT PRIMARY KEY NOT NULL REFERENCES article(id) ON DELETE CASCADE,
                    contentHash TEXT NOT NULL,
                    utf16Offset INTEGER NOT NULL,
                    progress REAL NOT NULL,
                    updatedAt DATETIME NOT NULL
                );
                """)
        }
    }

    @discardableResult public func saveReadingPosition(_ position: ReadingPosition) throws -> Bool {
        let value = ReadingPosition(
            articleId: position.articleId,
            contentHash: position.contentHash,
            utf16Offset: position.utf16Offset,
            progress: position.progress,
            updatedAt: position.updatedAt
        )
        return try database.write { db in
            guard try Article.exists(db, key: value.articleId) else { return false }
            try db.execute(
                sql: """
                INSERT INTO reading_position (articleId, contentHash, utf16Offset, progress, updatedAt)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(articleId) DO UPDATE SET
                    contentHash = excluded.contentHash,
                    utf16Offset = excluded.utf16Offset,
                    progress = excluded.progress,
                    updatedAt = excluded.updatedAt
                """,
                arguments: [value.articleId, value.contentHash, value.utf16Offset, value.progress, value.updatedAt]
            )
            return true
        }
    }

    public func readingPosition(articleId: String) throws -> ReadingPosition? {
        try database.read { db in
            try ReadingPosition.fetchOne(db, sql: "SELECT * FROM reading_position WHERE articleId = ?", arguments: [articleId])
        }
    }
}
