import Foundation
import GRDB

public enum NativeAnnotationError: LocalizedError, Equatable {
    case invalidNoteContent, noteUnavailable
    public var errorDescription: String? {
        switch self {
        case .invalidNoteContent: "Notes cannot contain null characters. Remove them and try again."
        case .noteUnavailable: "This note is no longer available. Your draft has not been saved."
        }
    }
}

public struct LibraryNote: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "library_note"
    public var id: String
    public var articleId: String
    public var highlightId: String?
    public var content: String
    public var createdAt: Date
    public var updatedAt: Date
}

public struct NativeAnnotationSourceAnchor: Codable, Sendable, Equatable {
    public var space: String
    public var text: String
    public var startOffset: Int
    public var endOffset: Int
    public var contextPrefix: String
    public var contextSuffix: String
    public var contentHash: String

    public init(space: String, text: String, startOffset: Int, endOffset: Int, contextPrefix: String, contextSuffix: String, contentHash: String) {
        self.space = space; self.text = text; self.startOffset = startOffset; self.endOffset = endOffset
        self.contextPrefix = contextPrefix; self.contextSuffix = contextSuffix; self.contentHash = contentHash
    }
    var isValid: Bool {
        ["web-dom-v1", "paper-drive-text-v1", "local-text-v1"].contains(space) &&
        startOffset >= 0 && endOffset > startOffset && endOffset <= 2_147_483_647 && endOffset - startOffset == text.utf16.count &&
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= 200_000 &&
        contextPrefix.utf16.count <= 2048 && contextSuffix.utf16.count <= 2048 &&
        ![text, contextPrefix, contextSuffix].contains(where: { $0.contains("\0") }) &&
        !contentHash.isEmpty && contentHash.utf8.count <= 128 &&
        (space == "web-dom-v1" ? contentHash.utf8.count == 14 && contentHash.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) } : NativeAnnotationCanonicalAnchor.validHash(contentHash))
    }

    /// Historical web rows are response data, not selectors authorized for upload or painting.
    /// Preserve malformed ranges, whitespace quotes, and unknown hashes verbatim for recovery.
    var isRecoverableSnapshotSource: Bool { space == "web-dom-v1" || isValid }

    static func boundedContext(_ value: String, suffix: Bool) -> String {
        var value = value
        while value.utf16.count > 2048 {
            if suffix { value.removeFirst() } else { value.removeLast() }
        }
        return value
    }
}

public struct NativeAnnotationCanonicalAnchor: Codable, Sendable, Equatable {
    public var text: String
    public var startOffset: Int
    public var endOffset: Int
    public var contentHash: String

    public init(text: String, startOffset: Int, endOffset: Int, contentHash: String) {
        self.text = text; self.startOffset = startOffset; self.endOffset = endOffset; self.contentHash = contentHash
    }
    static func validHash(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    public func range(in content: String) -> NSRange? {
        guard contentHash == Highlight.contentHash(content), startOffset >= 0, endOffset > startOffset,
              endOffset <= content.utf16.count, endOffset - startOffset == text.utf16.count else { return nil }
        let range = NSRange(location: startOffset, length: endOffset - startOffset)
        guard let swiftRange = Range(range, in: content), String(content[swiftRange]) == text else { return nil }
        return range
    }
}

public struct NativeAnnotationHighlight: Codable, Sendable, Equatable {
    public var id: String
    public var articleId: String
    public var color: HighlightColor
    public var sourceAnchor: NativeAnnotationSourceAnchor
    public var canonicalAnchor: NativeAnnotationCanonicalAnchor?
    public var resolution: String
    public var createdAt: Date
    public var updatedAt: Date

    func validatedCanonicalAnchor(article: NativeLibraryArticle) -> NativeAnnotationCanonicalAnchor? {
        guard resolution == "anchored", sourceAnchor.isValid, let canonicalAnchor,
              canonicalAnchor.text == sourceAnchor.text, canonicalAnchor.range(in: article.text) != nil else { return nil }
        if sourceAnchor.space != "web-dom-v1" {
            guard sourceAnchor.contentHash == article.contentHash,
                  canonicalAnchor.startOffset == sourceAnchor.startOffset,
                  canonicalAnchor.endOffset == sourceAnchor.endOffset else { return nil }
        }
        return canonicalAnchor
    }
}

public struct NativeAnnotationDeletion: Codable, Sendable, Equatable {
    public var kind: String
    public var id: String
}

public struct NativeAnnotationSnapshot: Codable, Sendable {
    public var complete: Bool
    public var reason: String? = nil
    public var notes: [LibraryNote]? = nil
    public var highlights: [NativeAnnotationHighlight]? = nil
    public var deleted: [NativeAnnotationDeletion]? = nil

    func validate(article: NativeLibraryArticle) throws {
        guard complete else {
            guard reason == "annotation_limit", notes == nil, highlights == nil, deleted == nil else { throw NativeLibraryError.invalidResponse }
            return
        }
        guard reason == nil, let notes, let highlights, let deleted,
              Set(notes.map { $0.id.lowercased() }).count == notes.count, Set(highlights.map { $0.id.lowercased() }).count == highlights.count,
              Set(deleted.map { $0.kind + ":" + $0.id.lowercased() }).count == deleted.count else { throw NativeLibraryError.invalidResponse }
        let validDates: (Date, Date) -> Bool = { $0.timeIntervalSince1970.isFinite && $1.timeIntervalSince1970.isFinite && $1 >= $0 }
        for note in notes {
            guard UUID(uuidString: note.id) != nil, note.articleId == article.id,
                  note.highlightId.map({ UUID(uuidString: $0) != nil }) ?? true,
                  validDates(note.createdAt, note.updatedAt) else { throw NativeLibraryError.invalidResponse }
        }
        for highlight in highlights {
            guard UUID(uuidString: highlight.id) != nil, highlight.articleId == article.id,
                  highlight.sourceAnchor.isRecoverableSnapshotSource, ["anchored", "unresolved"].contains(highlight.resolution),
                  validDates(highlight.createdAt, highlight.updatedAt) else { throw NativeLibraryError.invalidResponse }
            // Older web selectors can be malformed even when their row is otherwise valid.
            // The merge discards unverified derived placement, retaining the original source.
            if highlight.sourceAnchor.space == "web-dom-v1" { continue }
            if let canonical = highlight.canonicalAnchor {
                guard highlight.resolution == "anchored", canonical.text == highlight.sourceAnchor.text,
                      canonical.range(in: article.text) != nil else { throw NativeLibraryError.invalidResponse }
                if highlight.sourceAnchor.space != "web-dom-v1" {
                    guard highlight.sourceAnchor.contentHash == article.contentHash,
                          canonical.startOffset == highlight.sourceAnchor.startOffset,
                          canonical.endOffset == highlight.sourceAnchor.endOffset else { throw NativeLibraryError.invalidResponse }
                }
            } else if highlight.resolution == "anchored" { throw NativeLibraryError.invalidResponse }
        }
        for deletion in deleted {
            guard ["note", "highlight"].contains(deletion.kind), UUID(uuidString: deletion.id) != nil,
                  !(deletion.kind == "note" ? notes.map { $0.id.lowercased() } : highlights.map { $0.id.lowercased() }).contains(deletion.id.lowercased()) else { throw NativeLibraryError.invalidResponse }
        }
    }
}

/// Recovery exports intentionally contain annotation data only, with no session, namespace, or receipt payloads.
public struct NativeAnnotationState: Codable, FetchableRecord, Sendable {
    public var kind: String
    public var id: String
    public var articleId: String
    public var deleted: Bool
    public var present: Bool = true
    public var revision: String? = nil
    public var serverLive: Bool? = nil
    public var generation: Int? = nil
}
public struct NativeAnnotationImport: Codable, FetchableRecord, Sendable {
    public var kind: String
    public var legacyID: String
    public var annotationID: String
}
public struct NativeAnnotationRecovery: Codable, FetchableRecord, Sendable {
    public var id: String
    public var kind: String
    public var annotationID: String
    public var articleId: String
    public var payload: String
    public var capturedAt: Date
    public var reason: String
}

/// Owner-verified physical deletion is permanent across all former parent relationships.
public struct NativeAnnotationPermanentDeletion: Codable, FetchableRecord, Sendable {
    public var kind: String
    public var id: String
    public var revision: String?
}
