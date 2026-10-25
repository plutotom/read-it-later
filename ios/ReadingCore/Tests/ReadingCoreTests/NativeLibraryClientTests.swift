import XCTest
@testable import ReadingCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private struct LibraryHTTPReply: Sendable {
    let status: Int
    let data: Data
    var url: URL? = nil
    var contentType: String = "application/json"
}

private final class LibraryHTTPFixtures: @unchecked Sendable {
    private let lock = NSLock()
    private var handlers: [String: @Sendable (URLRequest) throws -> LibraryHTTPReply] = [:]
    func register(_ host: String, handler: @escaping @Sendable (URLRequest) throws -> LibraryHTTPReply) {
        lock.withLock { handlers[host] = handler }
    }
    func handle(_ request: URLRequest) throws -> LibraryHTTPReply {
        guard let handler = lock.withLock({ handlers[request.url!.host!] }) else { throw NativeLibraryError.unavailable }
        return try handler(request)
    }
}

private final class LibraryHTTPProtocol: URLProtocol, @unchecked Sendable {
    static let fixtures = LibraryHTTPFixtures()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let reply = try Self.fixtures.handle(request)
            let response = HTTPURLResponse(url: reply.url ?? request.url!, statusCode: reply.status, httpVersion: nil,
                headerFields: ["Content-Type": reply.contentType, "Set-Cookie": "fixture=must-not-persist; Secure", "Location": "https://other.example.com/"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: reply.data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class NativeLibraryClientTests: XCTestCase {
    private func fixture(protocolVersion: Int = 1, handler: @escaping @Sendable (URLRequest) throws -> LibraryHTTPReply) -> (NativeLibraryClient, NativeAuthSession) {
        let server = URL(string: "https://\(UUID().uuidString.lowercased()).example.com")!
        LibraryHTTPProtocol.fixtures.register(server.host!, handler: handler)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [LibraryHTTPProtocol.self]
        config.httpShouldSetCookies = true // The client must override this.
        let session = NativeAuthSession(user: NativeAuthUser(id: "fixture-a", name: "A", email: "fixture@example.com"), token: "fixture-only-signed-token", expiresAt: .distantFuture, server: server)
        return (NativeLibraryClient(configuration: config, protocolVersion: protocolVersion), session)
    }

    func testExactPathsSignedBearerNoCookiesAndOpaqueCursorEncoding() async throws {
        let cursor = "opaque+/= &?"
        let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "delete", articleId: UUID().uuidString.lowercased())
        let (client, session) = fixture { request in
            XCTAssertEqual(request.url!.scheme, "https")
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-only-signed-token")
            switch request.url!.path {
            case "/api/native/auth/session":
                XCTAssertEqual(request.httpMethod, "GET")
                return LibraryHTTPReply(status: 200, data: Data("{\"user\":{\"id\":\"fixture-a\",\"name\":\"A\",\"email\":\"fixture@example.com\"},\"expiresAt\":\"2099-01-01T00:00:00.123Z\"}".utf8))
            case "/api/native/library":
                XCTAssertTrue(request.url!.absoluteString.contains("%2B"))
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
                XCTAssertEqual(query.first { $0.name == "cursor" }?.value, cursor)
                XCTAssertEqual(query.first { $0.name == "limit" }?.value, "50")
                return LibraryHTTPReply(status: 200, data: Data("{\"protocolVersion\":1,\"changes\":[],\"cursor\":\"next\",\"hasMore\":false}".utf8))
            case "/api/native/library/mutations":
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
                let response = NativeLibraryAcknowledgment(protocolVersion: 1, results: [NativeLibraryMutationResult(mutationId: mutation.mutationId, status: "deleted", articleId: mutation.articleId)])
                return LibraryHTTPReply(status: 200, data: try NativeLibraryWire.encoder().encode(response))
            default: XCTFail("Unexpected path"); throw NativeLibraryError.invalidResponse
            }
        }
        let verified = try await client.verify(session)
        XCTAssertEqual(verified.user.id, session.user.id)
        let pulled = try await client.pull(session, cursor: cursor)
        XCTAssertEqual(pulled.cursor, "next")
        let acknowledged = try await client.push(session, mutations: [mutation])
        XCTAssertEqual(acknowledged.results.first?.mutationId, mutation.mutationId)
    }

    func testRedirectStatusForeignResponseOriginAndNonJSONAreRejected() async {
        let replies = [
            LibraryHTTPReply(status: 302, data: Data()),
            LibraryHTTPReply(status: 200, data: Data("{}".utf8), url: URL(string: "https://other.example.com/api/native/library")),
            LibraryHTTPReply(status: 200, data: Data("{}".utf8), contentType: "text/html")
        ]
        for reply in replies {
            let (client, session) = fixture { _ in reply }
            do { _ = try await client.pull(session, cursor: nil); XCTFail("Accepted unsafe response") }
            catch { XCTAssertEqual(error as? NativeLibraryError, .invalidResponse) }
        }
    }

    func testWrongOwnerInvalidDatesAndExpiredSessionsCannotProceed() async {
        for profile in [
            "{\"user\":{\"id\":\"fixture-b\",\"name\":\"B\",\"email\":\"b@example.com\"},\"expiresAt\":\"2099-01-01T00:00:00Z\"}",
            "{\"user\":{\"id\":\"fixture-a\",\"name\":\"A\",\"email\":\"fixture@example.com\"},\"expiresAt\":\"not-a-date\"}"
        ] {
            let (client, session) = fixture { _ in LibraryHTTPReply(status: 200, data: Data(profile.utf8)) }
            do { _ = try await client.verify(session); XCTFail("Accepted invalid identity/date") }
            catch { XCTAssertTrue([NativeLibraryError.invalidResponse, .accountMismatch].contains(error as? NativeLibraryError)) }
        }
        let (client, valid) = fixture { _ in XCTFail("Expired session touched transport"); throw NativeLibraryError.unavailable }
        let expired = NativeAuthSession(user: valid.user, token: valid.token, expiresAt: .distantPast, server: valid.server)
        do { _ = try await client.pull(expired, cursor: nil); XCTFail("Accepted expired session") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidSession) }
        let pathOrigin = NativeAuthSession(user: valid.user, token: valid.token, expiresAt: valid.expiresAt, server: valid.server.appendingPathComponent("unexpected"))
        do { _ = try await client.pull(pathOrigin, cursor: nil); XCTFail("Accepted path-bearing origin") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidSession) }
    }

    func testRecoverableHTTPErrorsAndMalformedArticleDates() async {
        for (status, expected) in [(401, NativeLibraryError.unauthorized), (403, .unauthorized), (429, .throttled), (503, .unavailable), (413, .tooLarge)] {
            let (client, session) = fixture { _ in LibraryHTTPReply(status: status, data: Data()) }
            do { _ = try await client.pull(session, cursor: nil); XCTFail("Accepted HTTP error") }
            catch { XCTAssertEqual(error as? NativeLibraryError, expected) }
        }
        let body = """
        {"protocolVersion":1,"changes":[{"revision":"1","id":"00000000-0000-4000-8000-000000000001","deleted":false,"article":{"id":"00000000-0000-4000-8000-000000000001","url":"https://example.com","title":"Fixture","text":"","contentHash":"\(Highlight.contentHash(""))","format":"paper-drive-text-v1","isRead":false,"isFavorite":false,"isArchived":false,"createdAt":"2026-10-24T00:00:00Z","updatedAt":"invalid"}}],"cursor":"cursor","hasMore":false}
        """
        let (client, session) = fixture { _ in LibraryHTTPReply(status: 200, data: Data(body.utf8)) }
        do { _ = try await client.pull(session, cursor: nil); XCTFail("Accepted malformed article date") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidResponse) }
    }
    func testProtocolTwoOptInUsesQueryAndMutationEnvelopeWithAnnotationFields() async throws {
        let articleID = UUID().uuidString.lowercased()
        let noteID = UUID().uuidString.lowercased()
        let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.create", articleId: articleID, noteId: noteID, content: "Fixture note")
        let (client, session) = fixture(protocolVersion: 2) { request in
            if request.url!.path == "/api/native/library" {
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
                XCTAssertEqual(query.first { $0.name == "protocolVersion" }?.value, "2")
                return LibraryHTTPReply(status: 200, data: try NativeLibraryWire.encoder().encode(NativeLibraryPage(protocolVersion: 2, changes: [], cursor: "two", hasMore: false)))
            }
            let body: Data
            if let bytes = request.httpBody { body = bytes }
            else {
                let stream = try XCTUnwrap(request.httpBodyStream)
                stream.open(); defer { stream.close() }
                var bytes = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    guard count >= 0 else { throw NativeLibraryError.invalidResponse }
                    if count == 0 { break }
                    bytes.append(contentsOf: buffer.prefix(count))
                }
                body = bytes
            }
            let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["protocolVersion"] as? Int, 2)
            let rows = try XCTUnwrap(json["mutations"] as? [[String: Any]])
            XCTAssertEqual(rows.first?["noteId"] as? String, noteID)
            XCTAssertEqual(rows.first?["content"] as? String, "Fixture note")
            XCTAssertNil(rows.first?["patch"])
            return LibraryHTTPReply(status: 200, data: try NativeLibraryWire.encoder().encode(NativeLibraryAcknowledgment(protocolVersion: 2,
                results: [NativeLibraryMutationResult(mutationId: mutation.mutationId, status: "applied", articleId: articleID, annotationId: noteID, effectRevision: "42")])))
        }
        XCTAssertEqual(client.protocolVersion, 2)
        _ = try await client.pull(session, cursor: nil)
        let ack = try await client.push(session, mutations: [mutation])
        XCTAssertEqual(ack.results.first?.annotationId, noteID)
        XCTAssertEqual(ack.results.first?.effectRevision, "42")
        let (legacy, legacySession) = fixture { _ in XCTFail("Protocol 1 dispatched an annotation"); throw NativeLibraryError.invalidResponse }
        do { _ = try await legacy.push(legacySession, mutations: [mutation]); XCTFail("Accepted protocol 2 mutation") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidResponse) }
    }

    func testStrictMutationValidationRejectsNullNotesAndMalformedSourceBeforeTransport() async throws {
        let articleID = UUID().uuidString.lowercased()
        let (client, session) = fixture(protocolVersion: 2) { _ in
            XCTFail("Invalid annotation reached transport")
            throw NativeLibraryError.unavailable
        }
        for mutation in [
            NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.create", articleId: articleID, noteId: UUID().uuidString.lowercased(), content: "bad\0note"),
            NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.update", articleId: articleID, patch: NativeLibraryPatch(content: "bad\0edit"), noteId: UUID().uuidString.lowercased())
        ] {
            do { _ = try await client.push(session, mutations: [mutation]); XCTFail("Accepted NUL") }
            catch { XCTAssertEqual(error as? NativeAnnotationError, .invalidNoteContent) }
        }
        let sources = [
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "quote", startOffset: 0, endOffset: 5, contextPrefix: "", contextSuffix: "", contentHash: ""),
            NativeAnnotationSourceAnchor(space: "local-text-v1", text: "quote", startOffset: 0, endOffset: 5, contextPrefix: String(repeating: "x", count: 2049), contextSuffix: "", contentHash: Highlight.contentHash("quote")),
            NativeAnnotationSourceAnchor(space: "local-text-v1", text: "quote", startOffset: 0, endOffset: 5, contextPrefix: "", contextSuffix: "bad\0context", contentHash: Highlight.contentHash("quote"))
        ]
        for source in sources {
            let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "highlight.create", articleId: articleID, highlightId: UUID().uuidString.lowercased(), color: .yellow, sourceAnchor: source)
            do { _ = try await client.push(session, mutations: [mutation]); XCTFail("Accepted invalid new selector") }
            catch { XCTAssertEqual(error as? NativeLibraryError, .invalidAnnotation) }
        }
    }

    func testOptionalPermanentDeletionFlagDecodesOnDeletedProtocolTwoReceipts() async throws {
        let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.delete", articleId: UUID().uuidString.lowercased(), noteId: UUID().uuidString.lowercased())
        for permanent in [true, false] {
            let (client, session) = fixture(protocolVersion: 2) { _ in
                let response = NativeLibraryAcknowledgment(protocolVersion: 2, results: [NativeLibraryMutationResult(mutationId: mutation.mutationId, status: "deleted", articleId: mutation.articleId, annotationId: mutation.noteId, effectRevision: "6", permanentDeletion: permanent)])
                return LibraryHTTPReply(status: 200, data: try NativeLibraryWire.encoder().encode(response))
            }
            let result = try await client.push(session, mutations: [mutation])
            XCTAssertEqual(result.results.first?.permanentDeletion, permanent)
            XCTAssertEqual(result.results.first?.effectRevision, "6")
        }
    }

}
