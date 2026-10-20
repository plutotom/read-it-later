import Foundation
import GRDB

public struct Article: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable {
    public static let databaseTableName = "article"
    public var id: String
    public var url: String
    public var title: String
    public var text: String
    public var note: String
    public var isRead: Bool
    public var isFavorite: Bool
    public var createdAt: Date
    public var error: String?
    public var downloadSuppressed: Bool = false
    public var isDownloaded: Bool { !text.isEmpty }
}

public enum LibraryError: LocalizedError {
    case invalidURL, noContent, tooLarge, unsupported, http(Int)
    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Enter a public HTTP or HTTPS link without a username or password."
        case .noContent: return "No readable article text found. This page may require login or JavaScript. Your link is still saved."
        case .tooLarge: return "This page exceeds the 5 MB test-build limit. Your link is still saved."
        case .unsupported: return "Version 0.1 reads HTML articles only. Open this document in your browser."
        case .http(let code): return "The website returned HTTP \(code). Your link is still saved."
        }
    }
}

public enum ArticleURL {
    public static func parse(_ input: String) throws -> URL {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var parts = URLComponents(string: trimmed),
              let scheme = parts.scheme?.lowercased(), ["https", "http"].contains(scheme),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil,
              host != "localhost", !host.hasSuffix(".local"),
              !host.contains(":"), !host.allSatisfy({ $0.isNumber || $0 == "." })
        else { throw LibraryError.invalidURL }
        parts.scheme = scheme
        parts.host = host
        parts.fragment = nil
        guard let url = parts.url else { throw LibraryError.invalidURL }
        return url
    }
}

/// Main-actor ownership keeps UI writes ordered. The extension only writes inbox files.
@MainActor public final class Library {
    private let database: DatabaseQueue

    public init(path: String? = nil) throws {
        if let path { database = try DatabaseQueue(path: path) }
        else { database = try DatabaseQueue() }
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table: "article") { t in
                t.column("id", .text).primaryKey()
                t.column("url", .text).notNull().unique()
                t.column("title", .text).notNull()
                t.column("text", .text).notNull()
                t.column("note", .text).notNull()
                t.column("isRead", .boolean).notNull()
                t.column("isFavorite", .boolean).notNull()
                t.column("createdAt", .datetime).notNull()
                t.column("error", .text)
            }
        }
        migrator.registerMigration("v2-highlights") { db in
            try db.create(table: "highlight") { t in
                t.column("id", .text).primaryKey()
                t.column("articleId", .text).notNull().references("article", onDelete: .cascade)
                t.column("text", .text).notNull()
                t.column("startOffset", .integer).notNull()
                t.column("endOffset", .integer).notNull()
                t.column("contextPrefix", .text).notNull()
                t.column("contextSuffix", .text).notNull()
                t.column("anchorContentHash", .text).notNull()
                t.column("color", .text).notNull()
                t.column("createdAt", .datetime).notNull()
                t.column("version", .integer).notNull()
                t.uniqueKey(["articleId", "anchorContentHash", "startOffset", "endOffset"])
            }
        }
        migrator.registerMigration("v3-download-storage") { db in
            try db.alter(table: "article") { t in
                t.add(column: "downloadSuppressed", .boolean).notNull().defaults(to: false)
            }
        }
        try migrator.migrate(database)
    }

    public func articles() throws -> [Article] {
        try database.read { try Article.fetchAll($0, sql: "SELECT * FROM article ORDER BY createdAt DESC, id") }
    }

    @discardableResult public func saveURL(_ input: String) throws -> Article {
        let url = try ArticleURL.parse(input)
        return try database.write { db in
            if let existing = try Article.fetchOne(db, sql: "SELECT * FROM article WHERE url = ?", arguments: [url.absoluteString]) { return existing }
            let article = Article(id: UUID().uuidString, url: url.absoluteString, title: url.host ?? "Saved article", text: "", note: "", isRead: false, isFavorite: false, createdAt: Date(), error: nil)
            try article.insert(db)
            return article
        }
    }

    /// Keep failed inbox files for recovery, but do not let one block other shared links.
    public func importInbox(at directory: URL) throws {
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        var firstError: (any Error)?
        for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where file.pathExtension == "json" {
            do {
                let input = try JSONDecoder().decode(String.self, from: Data(contentsOf: file))
                try saveURL(input)
                try FileManager.default.removeItem(at: file) // Remove only after durable DB commit.
            } catch {
                if firstError == nil { firstError = error }
            }
        }
        if let firstError { throw firstError }
    }

    public func saveContent(id: String, title: String, text: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET title = ?, text = ?, error = NULL, downloadSuppressed = 0 WHERE id = ?", arguments: [title, text, id]) }
    }
    /// Removes only downloaded text. Links, metadata, notes, and highlight quotes survive.
    /// Suppression is durable so resuming the app does not immediately undo cleanup.
    public func removeDownloads() throws {
        try database.write { try $0.execute(sql: "UPDATE article SET text = '', error = NULL, downloadSuppressed = 1") }
        // Reclaim freed SQLite pages without deleting the library or its annotations.
        try? database.writeWithoutTransaction { try $0.execute(sql: "VACUUM") }
    }
    public func saveError(id: String, message: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET error = ? WHERE id = ?", arguments: [message, id]) }
    }
    public func saveNote(id: String, text: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET note = ? WHERE id = ?", arguments: [text, id]) }
    }
    public func toggleRead(id: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET isRead = NOT isRead WHERE id = ?", arguments: [id]) }
    }
    public func toggleFavorite(id: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET isFavorite = NOT isFavorite WHERE id = ?", arguments: [id]) }
    }
    public func delete(id: String) throws {
        try database.write { try $0.execute(sql: "DELETE FROM article WHERE id = ?", arguments: [id]) }
    }
    public func exportJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let backup = try database.read { db in
            LibraryBackup(formatVersion: 2, articles: try Article.fetchAll(db), highlights: try Highlight.fetchAll(db))
        }
        return try encoder.encode(backup)
    }
}

extension Library {
    public func highlights(articleId: String) throws -> [Highlight] {
        try database.read { try Highlight.fetchAll($0, sql: "SELECT * FROM highlight WHERE articleId = ? ORDER BY startOffset, createdAt, id", arguments: [articleId]) }
    }

    @discardableResult public func addHighlight(articleId: String, content: String, range: NSRange) throws -> Highlight {
        guard range.location != NSNotFound, range.location >= 0, range.length > 0,
              range.location <= content.utf16.count,
              range.length <= content.utf16.count - range.location,
              let selected = Range(range, in: content), !content[selected].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw HighlightError.invalidSelection }
        return try database.write { db in
            guard let article = try Article.fetchOne(db, key: articleId), article.text == content else { throw HighlightError.invalidSelection }
            let hash = Highlight.contentHash(content)
            if let existing = try Highlight.fetchOne(db, sql: "SELECT * FROM highlight WHERE articleId = ? AND anchorContentHash = ? AND startOffset = ? AND endOffset = ?", arguments: [articleId, hash, range.location, NSMaxRange(range)]) { return existing }
            let highlight = Highlight(id: UUID().uuidString, articleId: articleId,
                text: String(content[selected]), startOffset: range.location, endOffset: NSMaxRange(range),
                contextPrefix: String(content[..<selected.lowerBound].suffix(32)),
                contextSuffix: String(content[selected.upperBound...].prefix(32)),
                anchorContentHash: hash, color: .yellow, createdAt: Date(), version: 1)
            try highlight.insert(db)
            return highlight
        }
    }

    public func setHighlightColor(id: String, color: HighlightColor) throws {
        try database.write { try $0.execute(sql: "UPDATE highlight SET color = ? WHERE id = ?", arguments: [color.rawValue, id]) }
    }
    public func deleteHighlight(id: String) throws {
        try database.write { try $0.execute(sql: "DELETE FROM highlight WHERE id = ?", arguments: [id]) }
    }
}
