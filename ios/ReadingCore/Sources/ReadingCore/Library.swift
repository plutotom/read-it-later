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

    public func saveContent(id: String, title: String, text: String) throws {
        try database.write { try $0.execute(sql: "UPDATE article SET title = ?, text = ?, error = NULL WHERE id = ?", arguments: [title, text, id]) }
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
        return try encoder.encode(articles())
    }
}
