import Foundation
import CryptoKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct NativeAuthUser: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let email: String
    public init(id: String, name: String, email: String) { self.id = id; self.name = name; self.email = email }
}

public struct NativeAuthSession: Codable, Equatable, Sendable {
    public let user: NativeAuthUser
    public let token: String
    public let expiresAt: Date
    public let server: URL
    public init(user: NativeAuthUser, token: String, expiresAt: Date, server: URL) {
        self.user = user; self.token = token; self.expiresAt = expiresAt; self.server = server
    }
    public var namespace: String {
        SHA256.hash(data: Data("\(server.absoluteString)|\(user.id)".utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

public enum NativeAuthError: LocalizedError, Equatable {
    case invalidServer, invalidCredentials, unauthorized, invalidResponse, throttled, unavailable
    public var errorDescription: String? {
        switch self {
        case .invalidServer: "Use an HTTPS server address without a path, query, or password."
        case .invalidCredentials: "That email or password was not accepted. Set up a password through your web account first."
        case .unauthorized: "Your session has expired or was revoked. Sign in again."
        case .invalidResponse: "The sign-in server returned an invalid response."
        case .throttled: "Too many attempts. Wait a minute and try again."
        case .unavailable: "Could not reach the sign-in server. Check your connection and try again."
        }
    }
}

public enum NativeAuthServer {
    public static func normalized(_ input: String, allowLocalhost: Bool = false) throws -> URL {
        guard var parts = URLComponents(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              parts.scheme == "https" || (allowLocalhost && parts.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)) else { throw NativeAuthError.invalidServer }
        parts.host = host; parts.path = ""
        guard let url = parts.url else { throw NativeAuthError.invalidServer }
        return url
    }
}

private final class AuthRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        // Credentials never follow a deployment redirect or another host.
        completionHandler(nil)
    }
}

public protocol NativeAuthAPI: Sendable {
    func signIn(email: String, password: String) async throws -> NativeAuthSession
    func refresh(_ existing: NativeAuthSession) async throws -> NativeAuthSession
    func signOut(_ existing: NativeAuthSession) async throws
}

public struct NativeAuthClient: NativeAuthAPI {
    public let server: URL
    private let session: URLSession
    public init(server: URL, configuration: URLSessionConfiguration? = nil) {
        self.server = server
            let config = configuration ?? URLSessionConfiguration.ephemeral
            config.httpShouldSetCookies = false; config.httpCookieStorage = nil
            config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
            config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 40
            self.session = URLSession(configuration: config, delegate: AuthRedirectBlocker(), delegateQueue: nil)
    }

    public func signIn(email: String, password: String) async throws -> NativeAuthSession {
        var request = URLRequest(url: server.appendingPathComponent("api/auth/sign-in/email"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password])
        let (_, response) = try await send(request, signingIn: true)
        // Better Auth's signed token header, not its raw JSON token or browser cookies.
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), token.count >= 32, token.count <= 2048,
              !token.contains(where: { $0.isWhitespace || $0.isNewline }) else { throw NativeAuthError.invalidResponse }
        return try await profile(token: token)
    }

    public func refresh(_ existing: NativeAuthSession) async throws -> NativeAuthSession {
        guard existing.server == server else { throw NativeAuthError.invalidServer }
        let refreshed = try await profile(token: existing.token)
        guard refreshed.user.id == existing.user.id else { throw NativeAuthError.invalidResponse }
        return refreshed
    }

    public func signOut(_ existing: NativeAuthSession) async throws {
        guard existing.server == server else { throw NativeAuthError.invalidServer }
        var request = URLRequest(url: server.appendingPathComponent("api/auth/sign-out"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(existing.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = Data("{}".utf8)
        _ = try await send(request)
    }

    private func profile(token: String) async throws -> NativeAuthSession {
        var request = URLRequest(url: server.appendingPathComponent("api/native/auth/session"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await send(request)
        struct Profile: Decodable { let user: NativeAuthUser; let expiresAt: String }
        guard let value = try? JSONDecoder().decode(Profile.self, from: data), !value.user.id.isEmpty,
              !value.user.email.isEmpty else { throw NativeAuthError.invalidResponse }
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let expiry = fractional.date(from: value.expiresAt) ?? ISO8601DateFormatter().date(from: value.expiresAt), expiry > Date() else { throw NativeAuthError.invalidResponse }
        return NativeAuthSession(user: value.user, token: token, expiresAt: expiry, server: server)
    }

    private func send(_ request: URLRequest, signingIn: Bool = false) async throws -> (Data, HTTPURLResponse) {
        let data: Data; let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw NativeAuthError.unavailable }
        guard let http = response as? HTTPURLResponse, data.count <= 65_536 else { throw NativeAuthError.invalidResponse }
        switch http.statusCode {
        case 200..<300: return (data, http)
        case 400: throw signingIn ? NativeAuthError.invalidCredentials : NativeAuthError.invalidResponse
        case 401, 403: throw signingIn ? NativeAuthError.invalidCredentials : NativeAuthError.unauthorized
        case 429: throw NativeAuthError.throttled
        default: throw NativeAuthError.unavailable
        }
    }
}
