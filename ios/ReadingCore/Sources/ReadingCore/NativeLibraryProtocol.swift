import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum NativeLibraryError: LocalizedError, Equatable {
    case invalidAnnotation, annotationLimit, disabled, accountMismatch, invalidResponse, invalidSession, unauthorized, throttled, unavailable, alreadySyncing, tooLarge, invalidURL, contentUnavailable
    public var errorDescription: String? {
        switch self {
        case .invalidAnnotation: "A saved annotation cannot be uploaded. Its original text remains on this device."
        case .annotationLimit: "Some annotations exceed the sync limit. Existing notes and highlights remain on this device."
        case .contentUnavailable: "This article’s text is unavailable for offline sync. Its link and flags are saved."
        case .disabled: "Library sync is disabled."
        case .accountMismatch: "This library belongs to another account or server. Open that account's library."
        case .invalidResponse: "The library server returned an invalid response."
        case .invalidSession, .unauthorized: "Your session has expired or was revoked. Sign in again."
        case .throttled: "Too many sync requests. Try again later."
        case .unavailable: "Could not sync. Your changes remain saved on this device."
        case .alreadySyncing: "Library sync is already running."
        case .tooLarge: "An article exceeds the 200,000-character or 1 MB sync limit. Your changes remain on this device."
        case .invalidURL: "An article’s link cannot be uploaded. Sync requires a public HTTP or HTTPS link without a username or password. Your article remains on this device."
        }
    }
}

public struct NativeLibraryArticle: Codable, Sendable, Equatable {
    public let id: String
    public let url: String
    public let title: String
    public let text: String
    public let contentHash: String
    public let format: String
    public let isRead: Bool
    public let isFavorite: Bool
    public let isArchived: Bool
    public let createdAt: Date
    public let updatedAt: Date
    public var contentUnavailable: Bool? = nil
}

public struct NativeLibraryChange: Codable, Sendable {
    public let revision: String
    public let id: String
    public let deleted: Bool
    public let article: NativeLibraryArticle?
    public var annotations: NativeAnnotationSnapshot? = nil
}

public struct NativeLibraryPage: Codable, Sendable {
    public let protocolVersion: Int
    public let changes: [NativeLibraryChange]
    public let cursor: String
    public let hasMore: Bool
}

public struct NativeLibraryPatch: Codable, Sendable, Equatable {
    public var isRead: Bool?
    public var isFavorite: Bool?
    public var isArchived: Bool?
    public var content: String?
    public var color: HighlightColor?
    public init(isRead: Bool? = nil, isFavorite: Bool? = nil, isArchived: Bool? = nil, content: String? = nil, color: HighlightColor? = nil) {
        self.isRead = isRead; self.isFavorite = isFavorite; self.isArchived = isArchived
        self.content = content; self.color = color
    }
}

/// Only frozen mutations are sent. A retry always uses identical bytes and IDs.
public struct NativeLibraryMutation: Codable, Sendable, Equatable {
    public let mutationId: String
    public let kind: String
    public var articleId: String
    public var url: String?
    public var title: String?
    public var text: String?
    public var isRead: Bool?
    public var isFavorite: Bool?
    public var patch: NativeLibraryPatch?
    public var noteId: String? = nil
    public var highlightId: String? = nil
    public var content: String? = nil
    public var color: HighlightColor? = nil
    public var sourceAnchor: NativeAnnotationSourceAnchor? = nil

    var isAnnotation: Bool { kind.hasPrefix("note.") || kind.hasPrefix("highlight.") }
    var annotationID: String? { kind.hasPrefix("note.") ? noteId : highlightId }
}

public struct NativeLibraryMutationResult: Codable, Sendable {
    public let mutationId: String
    public let status: String
    public let articleId: String
    public var annotationId: String? = nil
    public var effectRevision: String? = nil
    public var permanentDeletion: Bool? = nil
}

public struct NativeLibraryAcknowledgment: Codable, Sendable {
    public let protocolVersion: Int
    public let results: [NativeLibraryMutationResult]
}

public protocol NativeLibraryAPI: Sendable {
    func verify(_ session: NativeAuthSession) async throws -> NativeAuthSession
    func pull(_ session: NativeAuthSession, cursor: String?) async throws -> NativeLibraryPage
    func push(_ session: NativeAuthSession, mutations: [NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment
}

enum NativeLibraryWire {
    static let maxRequestBytes = 1_048_576
    static let maxCreateTextUTF16 = 200_000
    /// Keep in step with isNativeLibraryPublicURL in src/lib/native-library.ts.
    /// This is an upload policy only: server-owned text:// articles can still be pulled.
    static func isPublicURL(_ value: String) -> Bool {
        guard value == value.trimmingCharacters(in: .whitespacesAndNewlines),
              let parts = URLComponents(string: value),
              let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
              (parts.user ?? "").isEmpty, (parts.password ?? "").isEmpty,
              let url = parts.url, var host = url.host?.lowercased(),
              parts.port.map({ (0...65535).contains($0) }) ?? true else { return false }
        if host.hasSuffix(".") { host.removeLast() }
        guard host.contains("."), !host.contains(":"),
              ![".localhost", ".local", ".internal", ".test", ".invalid"].contains(where: host.hasSuffix),
              !host.utf8.allSatisfy({ (48...57).contains($0) || $0 == 46 }),
              !host.contains(where: { $0.isWhitespace || $0.isNewline || "#%/\\?@[]".contains($0) }) else { return false }
        // WHATWG URL parsing recognizes abbreviated, octal and hex IPv4, and rejects
        // domain names ending in an IPv4 number even when Foundation leaves them as names.
        let last = host.split(separator: ".", omittingEmptySubsequences: false).last ?? ""
        let decimal = !last.isEmpty && last.utf8.allSatisfy { (48...57).contains($0) }
        let hex = last.hasPrefix("0x") && last.dropFirst(2).utf8.allSatisfy {
            (48...57).contains($0) || (97...102).contains($0)
        }
        return !decimal && !hex
    }
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string) else {
                throw NativeLibraryError.invalidResponse
            }
            return date
        }
        return decoder
    }
    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
    /// Response budget measurement follows JSON.stringify rather than changing frozen uploads.
    static func responseEncoder() -> JSONEncoder {
        let encoder = encoder()
        encoder.outputFormatting.insert(.withoutEscapingSlashes)
        return encoder
    }
    struct Batch: Encodable { var protocolVersion = 1; let mutations: [NativeLibraryMutation] }
}

private final class LibraryRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// No cookies, disk cache, stored credentials, or redirects. Tokens only go to the session's exact origin.
public struct NativeLibraryClient: NativeLibraryAPI {
    private let transport: URLSession
    private let allowLocalhost: Bool
    public let protocolVersion: Int
    public init(configuration: URLSessionConfiguration? = nil, allowLocalhost: Bool = false, protocolVersion: Int = 1) {
        let config = (configuration?.copy() as? URLSessionConfiguration) ?? .ephemeral
        config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCredentialStorage = nil
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 60
        transport = URLSession(configuration: config, delegate: LibraryRedirectBlocker(), delegateQueue: nil)
        self.allowLocalhost = allowLocalhost
        self.protocolVersion = protocolVersion
    }
    public func verify(_ session: NativeAuthSession) async throws -> NativeAuthSession {
        struct Profile: Decodable { let user: NativeAuthUser; let expiresAt: Date }
        let profile: Profile = try await send(session, path: "api/native/auth/session")
        guard profile.user.id == session.user.id, profile.expiresAt > Date() else { throw NativeLibraryError.accountMismatch }
        return NativeAuthSession(user: profile.user, token: session.token, expiresAt: profile.expiresAt, server: session.server)
    }
    public func pull(_ session: NativeAuthSession, cursor: String?) async throws -> NativeLibraryPage {
        guard [1, 2].contains(protocolVersion) else { throw NativeLibraryError.invalidResponse }
        var query = [URLQueryItem(name: "limit", value: "50")]
        if protocolVersion == 2 { query.append(URLQueryItem(name: "protocolVersion", value: "2")) }
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(session, path: "api/native/library", query: query)
    }
    public func push(_ session: NativeAuthSession, mutations: [NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment {
        guard [1, 2].contains(protocolVersion), protocolVersion == 2 || !mutations.contains(where: \.isAnnotation), !mutations.isEmpty, mutations.count <= 25 else { throw NativeLibraryError.invalidResponse }
        for mutation in mutations {
            if mutation.kind == "note.create" || mutation.kind == "note.update" {
                guard !(mutation.content ?? mutation.patch?.content ?? "").contains("\0") else { throw NativeAnnotationError.invalidNoteContent }
            }
            if mutation.kind == "highlight.create", mutation.sourceAnchor?.isValid != true { throw NativeLibraryError.invalidAnnotation }
        }
        let body = try NativeLibraryWire.encoder().encode(NativeLibraryWire.Batch(protocolVersion: protocolVersion, mutations: mutations))
        guard body.count <= NativeLibraryWire.maxRequestBytes, mutations.allSatisfy({ ($0.text?.utf16.count ?? 0) <= NativeLibraryWire.maxCreateTextUTF16 &&
            (($0.content ?? $0.patch?.content)?.utf16.count ?? 0) <= 200_000 && ($0.sourceAnchor?.text.utf16.count ?? 0) <= 200_000 }) else { throw NativeLibraryError.tooLarge }
        return try await send(session, path: "api/native/library/mutations", body: body)
    }
    private func send<T: Decodable>(_ session: NativeAuthSession, path: String, query: [URLQueryItem] = [], body: Data? = nil) async throws -> T {
        guard session.expiresAt > Date(), !session.user.id.isEmpty,
              !session.token.isEmpty, session.token.count <= 2048,
              !session.token.contains(where: { $0.isWhitespace || $0.isNewline }),
              let origin = try? NativeAuthServer.normalized(session.server.absoluteString, allowLocalhost: allowLocalhost),
              origin == session.server else { throw NativeLibraryError.invalidSession }
        var components = URLComponents(url: origin.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query
            // URLSearchParams on the server treats a literal plus as a space.
            components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        let url = components.url!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpShouldHandleCookies = false
        if let body {
            request.httpMethod = "POST"; request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data; let response: URLResponse
        do { (data, response) = try await transport.data(for: request) }
        catch { if Task.isCancelled { throw CancellationError() }; throw NativeLibraryError.unavailable }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, http.url == url,
              data.count <= 4_194_304 else { throw NativeLibraryError.invalidResponse }
        switch http.statusCode {
        case 200: break
        case 401, 403: throw NativeLibraryError.unauthorized
        case 429: throw NativeLibraryError.throttled
        case 413: throw NativeLibraryError.tooLarge
        case 400, 409, 415: throw NativeLibraryError.invalidResponse
        case 300..<400: throw NativeLibraryError.invalidResponse
        default: throw NativeLibraryError.unavailable
        }
        guard http.value(forHTTPHeaderField: "Content-Type")?.split(separator: ";").first?.trimmingCharacters(in: .whitespaces).lowercased() == "application/json" else {
            throw NativeLibraryError.invalidResponse
        }
        do { return try NativeLibraryWire.decoder().decode(T.self, from: data) }
        catch { throw NativeLibraryError.invalidResponse }
    }
}
