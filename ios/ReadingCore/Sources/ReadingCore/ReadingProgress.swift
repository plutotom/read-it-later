import Foundation
import GRDB

/// Per-article reading location. Prefer `utf16Offset` when the article text is unchanged;
/// `progress` is a 0...1 fallback after a text replacement.
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
        return now.timeIntervalSince(previous) >= interval
    }

    public static func isMeaningfulChange(_ next: ReadingPosition, from previous: ReadingPosition?) -> Bool {
        guard let previous else { return true }
        if next.articleId != previous.articleId || next.contentHash != previous.contentHash { return true }
        if next.utf16Offset != previous.utf16Offset { return true }
        return abs(next.progress - previous.progress) >= progressEpsilon
    }

    /// Prefer the UTF-16 character when the saved text still matches; otherwise the scroll fraction.
    public static func resolve(saved: ReadingPosition, currentHash: String, utf16Count: Int) -> ReadingProgressAnchor? {
        let fraction = ReadingPosition.clampedProgress(saved.progress)
        if utf16Count <= 0 { return fraction > 0 ? .fraction(fraction) : nil }
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

    /// True when a long article still reports a tiny scrollable range — layout has not settled.
    public static func layoutLooksReady(utf16Count: Int, minOffsetY: CGFloat, maxOffsetY: CGFloat) -> Bool {
        if utf16Count < 400 { return true }
        return (maxOffsetY - minOffsetY) >= 8
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

    public func saveReadingPosition(_ position: ReadingPosition) throws {
        let value = ReadingPosition(
            articleId: position.articleId,
            contentHash: position.contentHash,
            utf16Offset: position.utf16Offset,
            progress: position.progress,
            updatedAt: position.updatedAt
        )
        try database.write { db in
            guard try Article.fetchOne(db, key: value.articleId) != nil else { return }
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
        }
    }

    public func readingPosition(articleId: String) throws -> ReadingPosition? {
        try database.read { db in
            try ReadingPosition.fetchOne(db, sql: "SELECT * FROM reading_position WHERE articleId = ?", arguments: [articleId])
        }
    }
}
