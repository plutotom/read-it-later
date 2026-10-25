import Foundation
import CryptoKit
import GRDB

public enum HighlightColor: String, Codable, CaseIterable, Sendable {
    case yellow, green, blue, pink, purple, orange, red, gray
}

public struct Highlight: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable {
    public static let databaseTableName = "highlight"
    public var id: String
    public var articleId: String
    public var text: String
    public var startOffset: Int
    public var endOffset: Int
    public var contextPrefix: String
    public var contextSuffix: String
    public var anchorContentHash: String
    public var color: HighlightColor
    public var createdAt: Date
    public var version: Int
    public var sourceAnchor: NativeAnnotationSourceAnchor? = nil
    public var canonicalAnchor: NativeAnnotationCanonicalAnchor? = nil
    public var resolution: String? = nil
    public var updatedAt: Date? = nil

    public static func contentHash(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Offsets use UTF-16, matching UITextView and JavaScript, not Swift Character indices.
    public func range(in content: String) -> NSRange? {
        if let canonicalAnchor, let range = canonicalAnchor.range(in: content) { return range }
        guard sourceAnchor?.space != "web-dom-v1", anchorContentHash == Self.contentHash(content), startOffset >= 0,
              endOffset > startOffset, endOffset <= content.utf16.count else { return nil }
        let range = NSRange(location: startOffset, length: endOffset - startOffset)
        guard let swiftRange = Range(range, in: content), String(content[swiftRange]) == text else { return nil }
        return range
    }
}

public enum HighlightError: LocalizedError {
    case invalidSelection
    public var errorDescription: String? { "Select some article text and try again. The saved article may have changed." }
}

public struct LibraryBackup: Codable, Sendable {
    public let formatVersion: Int
    public let articles: [Article]
    public let highlights: [Highlight]
    public var notes: [LibraryNote]? = nil
    public var annotationStates: [NativeAnnotationState]? = nil
    public var permanentAnnotationDeletions: [NativeAnnotationPermanentDeletion]? = nil
    public var annotationRecovery: [NativeAnnotationRecovery]? = nil
    public var annotationImports: [NativeAnnotationImport]? = nil
    public var canonicalTextSnapshots: [NativeLibraryTextSnapshot]? = nil
    public var textSnapshots: [NativeLibraryTextSnapshot]? = nil
}
