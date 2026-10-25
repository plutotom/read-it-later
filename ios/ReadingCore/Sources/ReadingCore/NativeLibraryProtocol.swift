import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum NativeLibraryError: LocalizedError, Equatable {
    case disabled, accountMismatch, invalidResponse, invalidSession, unauthorized, throttled, unavailable, alreadySyncing, tooLarge, contentUnavailable
    public var errorDescription: String? {
        switch self {
        case .contentUnavailable: "This article’s text is unavailable for offline sync. Its link and flags are saved."
        case .disabled: "Library sync is disabled."
        case .accountMismatch: "This library belongs to another account or server. Open that account's library."
        case .invalidResponse: "The library server returned an invalid response."
        case .invalidSession, .unauthorized: "Your session has expired or was revoked. Sign in again."
        case .throttled: "Too many sync requests. Try again later."
        case .unavailable: "Could not sync. Your changes remain saved on this device."
        case .alreadySyncing: "Library sync is already running."
        case .tooLarge: "An article exceeds the 200,000-character or 1 MB sync limit. Your changes remain on this device."
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
    public init(isRead: Bool? = nil, isFavorite: Bool? = nil, isArchived: Bool? = nil) {
        self.isRead = isRead; self.isFavorite = isFavorite; self.isArchived = isArchived
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
}

public struct NativeLibraryMutationResult: Codable, Sendable {
    public let mutationId: String
    public let status: String
    public let articleId: String
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
    struct Batch: Encodable { let protocolVersion = 1; let mutations: [NativeLibraryMutation] }
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
    public init(configuration: URLSessionConfiguration? = nil, allowLocalhost: Bool = false) {
        let config = (configuration?.copy() as? URLSessionConfiguration) ?? .ephemeral
        config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCredentialStorage = nil
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 60
        transport = URLSession(configuration: config, delegate: LibraryRedirectBlocker(), delegateQueue: nil)
        self.allowLocalhost = allowLocalhost
    }
    public func verify(_ session: NativeAuthSession) async throws -> NativeAuthSession {
        struct Profile: Decodable { let user: NativeAuthUser; let expiresAt: Date }
        let profile: Profile = try await send(session, path: "api/native/auth/session")
        guard profile.user.id == session.user.id, profile.expiresAt > Date() else { throw NativeLibraryError.accountMismatch }
        return NativeAuthSession(user: profile.user, token: session.token, expiresAt: profile.expiresAt, server: session.server)
    }
    public func pull(_ session: NativeAuthSession, cursor: String?) async throws -> NativeLibraryPage {
        var query = [URLQueryItem(name: "limit", value: "50")]
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(session, path: "api/native/library", query: query)
    }
    public func push(_ session: NativeAuthSession, mutations: [NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment {
        guard !mutations.isEmpty, mutations.count <= 25 else { throw NativeLibraryError.invalidResponse }
        let body = try NativeLibraryWire.encoder().encode(NativeLibraryWire.Batch(mutations: mutations))
        guard body.count <= NativeLibraryWire.maxRequestBytes, mutations.allSatisfy({ ($0.text?.utf16.count ?? 0) <= NativeLibraryWire.maxCreateTextUTF16 }) else { throw NativeLibraryError.tooLarge }
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
