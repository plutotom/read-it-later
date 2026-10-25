import XCTest
@testable import ReadingCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private final class AuthResponses: @unchecked Sendable {
    let lock = NSLock()
    var handlers: [String: @Sendable (URLRequest) throws -> (Int, [String: String], Data)] = [:]
    func register(_ host: String, handler: @escaping @Sendable (URLRequest) throws -> (Int, [String: String], Data)) {
        lock.withLock { handlers[host] = handler }
    }
    func handler(_ host: String) -> (@Sendable (URLRequest) throws -> (Int, [String: String], Data))? {
        lock.withLock { handlers[host] }
    }
}

private final class AuthProtocol: URLProtocol, @unchecked Sendable {
    static let responses = AuthResponses()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let url = request.url!
            let (status, headers, data) = try Self.responses.handler(url.host!)!(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class NativeAuthTests: XCTestCase {
    private func client(handler: @escaping @Sendable (URLRequest) throws -> (Int, [String: String], Data)) -> NativeAuthClient {
        let server = URL(string: "https://\(UUID().uuidString.lowercased()).example.invalid")!
        AuthProtocol.responses.register(server.host!, handler: handler)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [AuthProtocol.self]
        return NativeAuthClient(server: server, configuration: config)
    }

    func testLoginUsesSignedHeaderAndVerifiesServerIdentityBeforeReturningSession() async throws {
        let signed = String(repeating: "s", count: 43) + ".signature"
        let api = client { request in
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            if request.url!.path == "/api/auth/sign-in/email" {
                XCTAssertEqual(request.httpMethod, "POST")
                return (200, ["set-auth-token": signed], Data("{\"token\":\"raw-token-must-not-be-used\"}".utf8))
            }
            XCTAssertEqual(request.url!.path, "/api/native/auth/session")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + signed)
            return (200, [:], Data("{\"user\":{\"id\":\"account-a\",\"email\":\"a@example.invalid\",\"name\":\"A\"},\"expiresAt\":\"2099-01-01T00:00:00.123Z\"}".utf8))
        }
        let session = try await api.signIn(email: "a@example.invalid", password: "fixture-only-password")
        XCTAssertEqual(session.user.id, "account-a"); XCTAssertEqual(session.token, signed)
    }

    func testRawJSONTokenWithoutSignedHeaderCannotEstablishSession() async {
        let api = client { _ in (200, [:], Data("{\"token\":\"raw\"}".utf8)) }
        do { _ = try await api.signIn(email: "a@example.invalid", password: "fixture"); XCTFail("Accepted unsigned response") }
        catch { XCTAssertEqual(error as? NativeAuthError, .invalidResponse) }
    }

    func testRevokedSessionAndThrottlingHaveDistinctRecoverableErrors() async {
        for (status, expected) in [(401, NativeAuthError.invalidCredentials), (429, .throttled), (503, .unavailable)] {
            let api = client { _ in (status, [:], Data()) }
            do { _ = try await api.signIn(email: "a@example.invalid", password: "fixture"); XCTFail("Accepted failure") }
            catch { XCTAssertEqual(error as? NativeAuthError, expected) }
        }
        let api = client { _ in (401, [:], Data()) }
        let session = NativeAuthSession(user: NativeAuthUser(id: "a", name: "A", email: "a@example.invalid"), token: "fixture", expiresAt: .distantFuture, server: api.server)
        do { _ = try await api.refresh(session); XCTFail("Accepted revoked session") }
        catch { XCTAssertEqual(error as? NativeAuthError, .unauthorized) }
    }

    func testRefreshCannotSilentlySwitchAccountsOrSendTokenToAnotherEnvironment() async {
        let api = client { _ in (200, [:], Data("{\"user\":{\"id\":\"b\",\"email\":\"b@example.invalid\",\"name\":\"B\"},\"expiresAt\":\"2099-01-01T00:00:00Z\"}".utf8)) }
        let a = NativeAuthUser(id: "a", name: "A", email: "a@example.invalid")
        do { _ = try await api.refresh(NativeAuthSession(user: a, token: "fixture", expiresAt: .distantFuture, server: api.server)); XCTFail("Changed owner") }
        catch { XCTAssertEqual(error as? NativeAuthError, .invalidResponse) }
        do { _ = try await api.refresh(NativeAuthSession(user: a, token: "fixture", expiresAt: .distantFuture, server: URL(string: "https://other.example.invalid")!)); XCTFail("Changed environment") }
        catch { XCTAssertEqual(error as? NativeAuthError, .invalidServer) }
    }

    func testServerValidationAndAccountNamespaces() throws {
        for value in ["http://example.org", "https://user:pass@example.org", "https://example.org/path", "https://example.org?token=x", "https://example.org#x"] {
            XCTAssertThrowsError(try NativeAuthServer.normalized(value))
        }
        XCTAssertEqual(try NativeAuthServer.normalized("https://EXAMPLE.org/").absoluteString, "https://example.org")
        XCTAssertThrowsError(try NativeAuthServer.normalized("http://localhost:4114"))
        XCTAssertNoThrow(try NativeAuthServer.normalized("http://localhost:4114", allowLocalhost: true))
        let a = NativeAuthUser(id: "a", name: "A", email: "a@example.invalid")
        let b = NativeAuthUser(id: "b", name: "B", email: "b@example.invalid")
        func namespace(_ user: NativeAuthUser, _ server: String) -> String {
            NativeAuthSession(user: user, token: "never-part-of-key", expiresAt: .distantFuture, server: URL(string: server)!).namespace
        }
        XCTAssertNotEqual(namespace(a, "https://example.org"), namespace(b, "https://example.org"))
        XCTAssertNotEqual(namespace(a, "https://example.org"), namespace(a, "https://beta.example.org"))
    }

    @MainActor func testLegacyLibraryImportPreservesNotesAndHighlightsAndBelongsOnlyToFirstAccount() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let legacy = try Library(path: root.appendingPathComponent("library.sqlite").path)
        let article = try legacy.saveURL("https://example.org/article")
        try legacy.saveContent(id: article.id, title: "Legacy", text: "A saved quote.")
        try legacy.saveNote(id: article.id, text: "Keep this note")
        _ = try legacy.addHighlight(articleId: article.id, content: "A saved quote.", range: NSRange(location: 2, length: 5))
        let first = try AccountLibrary.open(root: root, namespace: String(repeating: "a", count: 64))
        XCTAssertEqual(try first.articles().first?.note, "Keep this note")
        XCTAssertEqual(try first.highlights(articleId: article.id).count, 1)
        let second = try AccountLibrary.open(root: root, namespace: String(repeating: "b", count: 64))
        XCTAssertTrue(try second.articles().isEmpty)
        XCTAssertEqual(try legacy.articles().count, 1)
        let again = try AccountLibrary.open(root: root, namespace: String(repeating: "a", count: 64))
        XCTAssertEqual(try again.articles().count, 1)
    }
    @MainActor func testCorruptLegacyOwnerCannotExposeLegacyLibraryToAnotherAccount() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("invalid-owner".utf8).write(to: root.appendingPathComponent("legacy-account-owner"))
        XCTAssertThrowsError(try AccountLibrary.open(root: root, namespace: String(repeating: "b", count: 64)))
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("legacy-account-owner"), encoding: .utf8), "invalid-owner")
    }

}
