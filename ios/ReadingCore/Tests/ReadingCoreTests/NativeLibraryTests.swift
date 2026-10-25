import XCTest
import GRDB
@testable import ReadingCore

@MainActor private final class FixtureLibraryAPI: NativeLibraryAPI {
    var pushes: [[NativeLibraryMutation]] = []
    var cursors: [String?] = []
    var verifications = 0
    var onVerify: ((NativeAuthSession) async throws -> NativeAuthSession)?
    var onPush: (([NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment)?
    var onPull: ((String?) async throws -> NativeLibraryPage)?
    func verify(_ session: NativeAuthSession) async throws -> NativeAuthSession {
        verifications += 1
        if let onVerify { return try await onVerify(session) }; return session
    }
    func push(_ session: NativeAuthSession, mutations: [NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment {
        pushes.append(mutations)
        if let onPush { return try await onPush(mutations) }
        return Self.ack(mutations)
    }
    func pull(_ session: NativeAuthSession, cursor: String?) async throws -> NativeLibraryPage {
        cursors.append(cursor)
        if let onPull { return try await onPull(cursor) }
        return NativeLibraryPage(protocolVersion: 1, changes: [], cursor: "complete", hasMore: false)
    }
    static func ack(_ mutations: [NativeLibraryMutation], serverID: String? = nil) -> NativeLibraryAcknowledgment {
        NativeLibraryAcknowledgment(protocolVersion: 1, results: mutations.map {
            NativeLibraryMutationResult(mutationId: $0.mutationId, status: $0.kind == "delete" ? "deleted" : "applied", articleId: serverID ?? $0.articleId)
        })
    }
}

@MainActor final class NativeLibraryTests: XCTestCase {
    private let server = URL(string: "https://sync.example.com")!
    private func session(user: String = "fixture-a", server: URL? = nil) -> NativeAuthSession {
        NativeAuthSession(user: NativeAuthUser(id: user, name: "Fixture", email: "fixture@example.com"), token: "fixture-only-signed-token", expiresAt: .distantFuture, server: server ?? self.server)
    }
    private func root() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("native-sync-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
    private func remote(id: String = UUID().uuidString, url: String = "https://example.com/article", text: String = "Canonical\n\ntext", title: String = "Remote", read: Bool = false, favorite: Bool = false, archived: Bool = false) -> NativeLibraryArticle {
        NativeLibraryArticle(id: id, url: url, title: title, text: text, contentHash: Highlight.contentHash(text), format: "paper-drive-text-v1", isRead: read, isFavorite: favorite, isArchived: archived, createdAt: Date(timeIntervalSince1970: 100), updatedAt: Date(timeIntervalSince1970: 200))
    }
    private func page(_ articles: [NativeLibraryArticle], cursor: String = "page-1", more: Bool = false) -> NativeLibraryPage {
        NativeLibraryPage(protocolVersion: 1, changes: articles.enumerated().map {
            NativeLibraryChange(revision: String($0.offset + 1), id: $0.element.id, deleted: false, article: $0.element)
        }, cursor: cursor, hasMore: more)
    }
    private func pendingMutations(_ library: Library, id: String? = nil) throws -> [NativeLibraryMutation] {
        try library.database.read { try library.pending(in: $0, id: id).map(\.mutation) }
    }

    func testOptInAndLegacyBootstrapOnlyOnceAcrossRestart() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("library.sqlite").path
        let legacy = try Library(path: path)
        let article = try legacy.saveURL("https://example.com/legacy")
        try legacy.saveContent(id: article.id, title: "Legacy", text: "Keep this text")
        try legacy.toggleFavorite(id: article.id)
        XCTAssertEqual(try legacy.syncState().pendingCount, 0)
        let api = FixtureLibraryAPI()
        do { try await legacy.sync(session: session(), client: api); XCTFail("Synced without opt-in") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .disabled) }
        XCTAssertEqual(api.verifications, 0)
        try legacy.enableSync(session: session())
        try legacy.enableSync(session: session())
        XCTAssertEqual(try legacy.syncState().pendingCount, 1)
        let reopened = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try reopened.syncState().pendingCount, 1)
        try await reopened.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.count, 1)
        XCTAssertEqual(api.pushes[0][0].text, "Keep this text")
        XCTAssertEqual(try reopened.articleServerID(article.id), article.id)
        let again = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try again.syncState().pendingCount, 0)
        XCTAssertNotNil(try again.syncState().lastSuccess)
        try await again.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.count, 1)
    }

    func testCrashAfterServerCommitRetriesIdenticalPayloadAndDownloadCleanupCannotEraseIt() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("library.sqlite").path
        let first = try Library(path: path, syncEnabled: true)
        let article = try first.saveURL("https://example.com/crash")
        try first.saveContent(id: article.id, title: "Crash fixture", text: "Durable original 👋")
        let api = FixtureLibraryAPI()
        let actualID = UUID().uuidString
        var serverRecords: [String: NativeLibraryMutation] = [:]
        var lostResponse = true
        api.onPush = { mutations in
            for mutation in mutations {
                if let committed = serverRecords[mutation.mutationId] { XCTAssertEqual(committed, mutation) }
                else { serverRecords[mutation.mutationId] = mutation }
            }
            if lostResponse { lostResponse = false; throw NativeLibraryError.unavailable }
            return FixtureLibraryAPI.ack(mutations, serverID: actualID)
        }
        do { try await first.sync(session: session(), client: api); XCTFail("Expected lost response") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
        XCTAssertEqual(try first.syncState().pendingCount, 1)
        XCTAssertNotNil(try first.syncState().lastError)
        try first.removeDownloads()
        XCTAssertEqual(try first.articles().first?.text, "")
        let reopened = try Library(path: path, syncEnabled: true)
        try await reopened.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes[0], api.pushes[1])
        XCTAssertEqual(api.pushes[1][0].text, "Durable original 👋")
        XCTAssertEqual(serverRecords.count, 1)
        XCTAssertEqual(try reopened.articleServerID(article.id), actualID)
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
        XCTAssertNil(try reopened.syncState().lastError)
    }

    func testFrozenEmptyLinkThenContentFillUsesSameArticleAndNewMutationID() async throws {
        let library = try Library(syncEnabled: true)
        let article = try library.saveURL("https://example.com/late-extraction")
        let api = FixtureLibraryAPI()
        var stored: NativeLibraryArticle?
        api.onPush = { [self] mutations in
            for mutation in mutations {
                XCTAssertEqual(mutation.kind, "create")
                if stored == nil || stored?.text.isEmpty == true {
                    stored = remote(id: mutation.articleId, url: mutation.url!, text: mutation.text!, title: mutation.title!)
                }
            }
            return FixtureLibraryAPI.ack(mutations)
        }
        api.onPull = { [self] _ in page([stored!]) }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(stored?.text, "")
        try library.saveContent(id: article.id, title: "Downloaded", text: "Extracted after first upload")
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.count, 2)
        XCTAssertEqual(api.pushes[0][0].articleId, api.pushes[1][0].articleId)
        XCTAssertNotEqual(api.pushes[0][0].mutationId, api.pushes[1][0].mutationId)
        XCTAssertEqual(try library.canonicalTextSnapshot(articleID: article.id)?.text, "Extracted after first upload")
        // Subsequent create must not overwrite existing nonempty canonical text.
        try library.saveContent(id: article.id, title: "Local change", text: "Local retained version")
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articles().first?.text, "Extracted after first upload")
        XCTAssertTrue(try library.textSnapshots(articleID: article.id).contains { $0.text == "Local retained version" })
    }

    func testAccountAndOriginMismatchBlockedBeforeNetworkIncludingAfterRestart() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path)
        try library.enableSync(session: session())
        _ = try library.saveURL("https://example.com/private-fixture")
        let reopened = try Library(path: path, syncEnabled: true)
        let api = FixtureLibraryAPI()
        for other in [session(user: "fixture-b"), session(server: URL(string: "https://other.example.com")!)] {
            do { try await reopened.sync(session: other, client: api); XCTFail("Crossed account boundary") }
            catch { XCTAssertEqual(error as? NativeLibraryError, .accountMismatch) }
        }
        XCTAssertEqual(api.verifications, 0); XCTAssertTrue(api.pushes.isEmpty)
        api.onVerify = { [self] _ in session(user: "fixture-b") }
        do { try await reopened.sync(session: session(), client: api); XCTFail("Accepted another owner") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .accountMismatch) }
        XCTAssertTrue(api.pushes.isEmpty); XCTAssertTrue(api.cursors.isEmpty)
        XCTAssertEqual(try reopened.syncState().pendingCount, 1)
    }

    func testDirtyFieldOverlayAndAcknowledgingOlderMutationDoesNotClearNewerEdit() throws {
        let library = try Library(syncEnabled: true)
        let article = try library.saveURL("https://example.com/overlay")
        let create = try library.prepareBatch()
        try library.acknowledge(FixtureLibraryAPI.ack(create.map(\.mutation)), batch: create)
        try library.toggleRead(id: article.id) // true, frozen and sent
        let older = try library.prepareBatch()
        try library.toggleRead(id: article.id) // false, newer queued assignment
        try library.acknowledge(FixtureLibraryAPI.ack(older.map(\.mutation)), batch: older)
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        try library.apply(page([remote(id: article.id, read: true, favorite: true, archived: true)]), after: nil)
        let overlaid = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(overlaid.isRead)
        XCTAssertTrue(overlaid.isFavorite); XCTAssertTrue(overlaid.isArchived)
        XCTAssertEqual(overlaid.title, "Remote")
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        XCTAssertEqual(try library.prepareBatch().first?.mutation.patch, NativeLibraryPatch(isRead: false))
    }

    func testLegacyTextAndHighlightSurviveCanonicalReplacementWithoutMispainting() throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/snapshots")
        let original = "First quote 👋. Second quote."
        try library.saveContent(id: article.id, title: "Legacy title", text: original)
        try library.saveNote(id: article.id, text: "Local note")
        let highlight = try library.addHighlight(articleId: article.id, content: original, range: (original as NSString).range(of: "Second quote"))
        try library.enableSync()
        let batch = try library.prepareBatch()
        let serverID = UUID().uuidString
        try library.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation), serverID: serverID), batch: batch)
        let canonical = "First quote 👋.\n\nSecond quote."
        try library.apply(page([remote(id: serverID, text: canonical)]), after: nil)
        let updated = try XCTUnwrap(library.articles().first)
        XCTAssertEqual(updated.id, article.id); XCTAssertEqual(updated.note, "Local note")
        XCTAssertEqual(try library.highlights(articleId: article.id).first?.id, highlight.id)
        XCTAssertNil(highlight.range(in: updated.text))
        let retained = try XCTUnwrap(library.textSnapshots(articleID: article.id).first { $0.text == original })
        XCTAssertNotNil(highlight.range(in: retained.text))
        XCTAssertEqual(try library.canonicalTextSnapshot(articleID: article.id)?.contentHash, Highlight.contentHash(canonical))
        try library.apply(page([remote(id: serverID, text: "Next canonical")], cursor: "page-2"), after: "page-1")
        XCTAssertTrue(try library.textSnapshots(articleID: article.id).contains { $0.text == canonical && $0.source == "server" })
        XCTAssertEqual(try library.syncState().pendingCount, 0) // Remote apply never echoes.
    }

    func testServerDuplicateURLsAndManualTextAndPDFKeepDistinctStableIDs() throws {
        let library = try Library(syncEnabled: true)
        let a = remote(), b = remote(), manual = remote(url: "text://manual-fixture", text: "Manual text"), pdf = remote(url: "https://example.com/document.pdf", text: "PDF text")
        try library.apply(page([a, b, manual, pdf]), after: nil)
        let first = try library.articles()
        XCTAssertEqual(first.count, 4)
        let byServer = try Dictionary(uniqueKeysWithValues: first.map { (try library.articleServerID($0.id)!, $0.id) })
        XCTAssertNotEqual(byServer[a.id], byServer[b.id])
        try library.apply(page([b, a, manual, pdf], cursor: "page-2"), after: "page-1")
        for article in try library.articles() { XCTAssertEqual(byServer[try library.articleServerID(article.id)!], article.id) }
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testPublicCreateURLPolicyMatchesBackendHostAndCredentialRules() throws {
        let rejected = [
            "https://intranet/", "https://localhost/", "https://localhost./",
            "https://host.localhost/", "https://host.local/", "https://host.internal/",
            "https://host.test/", "https://HOST.INVALID./", "https://127.0.0.1/",
            "https://127.1/", "https://0x7f.1/", "https://0177.0.0.1/",
            "https://2130706433/", "https://[::1]/", "https://example.123/",
            "https://user@example.com/", "https://user:password@example.com/",
            "https://:password@example.com/", "text://manual", "file:///example.com",
            "https://example.com:65536/", "https://%31%32%37.0.0.1/"
        ]
        let library = try Library(syncEnabled: true)
        for url in rejected {
            XCTAssertFalse(NativeLibraryWire.isPublicURL(url), url)
            XCTAssertThrowsError(try library.saveURL(url), url)
        }
        for url in ["https://example.com/a?query=keep", "http://EXAMPLE.COM./", "https://sub.example.com:8443/", "https://example.test.com/", "https://bücher.example/"] {
            XCTAssertTrue(NativeLibraryWire.isPublicURL(url), url)
            XCTAssertNoThrow(try library.saveURL(url), url)
        }
        XCTAssertEqual(try library.articles().count, 5)
        XCTAssertEqual(try library.syncState().pendingCount, 5)
    }

    func testLegacyInvalidURLQuarantineSurvivesRestartWhileValidPushAndPullContinue() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("invalid-url.sqlite").path
        let legacy = try Library(path: path)
        // Simulate records accepted by the earlier, less restrictive local URL parser.
        let invalidURLs = ["https://intranet/", "https://host.test/", "https://host.internal/", "https://127.1/"]
        let originals = invalidURLs.map { url in
            Article(id: UUID().uuidString.lowercased(), url: url, title: "Legacy", text: "Retained quote.", note: "Keep note", isRead: false, isFavorite: false, createdAt: Date(), error: nil)
        }
        try await legacy.database.write { db in for article in originals { try article.insert(db) } }
        let quote = try legacy.addHighlight(articleId: originals[0].id, content: originals[0].text, range: NSRange(location: 0, length: 8))
        let valid = try legacy.saveURL("https://example.com/valid")
        try legacy.enableSync(session: session())
        try legacy.toggleFavorite(id: originals[0].id) // An unmapped create must block its own flags only.
        let retained = try pendingMutations(legacy, id: originals[0].id)
        let reopened = try Library(path: path, syncEnabled: true)
        let incoming = remote(url: "https://example.com/pulled")
        let api = FixtureLibraryAPI()
        api.onPull = { [self] _ in page([incoming], cursor: "pulled") }
        do { try await reopened.sync(session: session(), client: api); XCTFail("Expected URL quarantine") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidURL) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.articleId), [valid.id])
        XCTAssertEqual(try reopened.syncCursor(), "pulled")
        XCTAssertNotNil(try reopened.syncState().lastSuccess)
        XCTAssertEqual(try reopened.syncState().lastError, NativeLibraryError.invalidURL.errorDescription)
        XCTAssertEqual(try reopened.syncState().pendingCount, invalidURLs.count + 1)
        for original in originals {
            let article = try XCTUnwrap(reopened.articles().first { $0.id == original.id })
            XCTAssertEqual(article.url, original.url); XCTAssertEqual(article.text, original.text)
            XCTAssertEqual(article.note, original.note)
            XCTAssertEqual(article.error, NativeLibraryError.invalidURL.errorDescription)
        }
        XCTAssertEqual(try reopened.highlights(articleId: originals[0].id).first?.id, quote.id)
        XCTAssertEqual(try pendingMutations(reopened, id: originals[0].id), retained)
        try reopened.removeDownloads()
        XCTAssertEqual(try reopened.articles().first { $0.id == originals[0].id }?.error, NativeLibraryError.invalidURL.errorDescription)
        let resumed = try Library(path: path, syncEnabled: true)
        let secondValid = try resumed.saveURL("https://example.com/second-valid")
        api.onPull = { [self] cursor in
            XCTAssertEqual(cursor, "pulled")
            return page([remote(url: "https://example.com/second-pull")], cursor: "pulled-again")
        }
        do { try await resumed.sync(session: session(), client: api); XCTFail("Expected URL quarantine") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidURL) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.articleId), [valid.id, secondValid.id])
        XCTAssertEqual(try resumed.syncCursor(), "pulled-again")
        XCTAssertEqual(try pendingMutations(resumed, id: originals[0].id), retained)
    }

    func testFrozenInvalidCreateStaysImmutableAndDeleteBypassesQuarantine() async throws {
        let library = try Library(syncEnabled: true)
        let original = remote(url: "text://manual-fixture", text: "Canonical")
        try library.apply(page([original]), after: nil)
        let local = try XCTUnwrap(library.articles().first)
        XCTAssertThrowsError(try library.saveContent(id: local.id, title: "Local", text: "Local quote.")) {
            XCTAssertEqual($0 as? NativeLibraryError, .invalidURL)
        }
        // Older versions could have frozen such creates before receiving a backend 400.
        try await library.database.write { try $0.execute(sql: "UPDATE native_pending SET frozen = 1") }
        let frozen = try XCTUnwrap(pendingMutations(library).first)
        try library.toggleFavorite(id: local.id)
        let api = FixtureLibraryAPI()
        do { try await library.sync(session: session(), client: api); XCTFail("Expected URL quarantine") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidURL) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["update"])
        XCTAssertEqual(try pendingMutations(library).first, frozen)
        try library.delete(id: local.id)
        do { try await library.sync(session: session(), client: api); XCTFail("Frozen quarantine remains retained") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .invalidURL) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["update", "delete"])
        XCTAssertEqual(api.pushes.last?.first?.articleId, original.id)
        XCTAssertTrue(try library.articles().isEmpty)
        XCTAssertEqual(try pendingMutations(library).first, frozen)
        XCTAssertTrue(try library.textSnapshots(articleID: local.id).contains { $0.text == "Local quote." })
    }

    func testDeletingNeverSentInvalidURLSupersedesBlockedCreate() async throws {
        let library = try Library()
        let article = Article(id: UUID().uuidString.lowercased(), url: "https://host.invalid/", title: "Legacy", text: "Local quote.", note: "Keep", isRead: false, isFavorite: false, createdAt: Date(), error: nil)
        try await library.database.write { try article.insert($0) }
        try library.enableSync()
        try library.delete(id: article.id)
        let api = FixtureLibraryAPI()
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["delete"])
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertTrue(try library.textSnapshots(articleID: article.id).contains { $0.text == article.text })
    }

    func testManualTextDownloadRestoreUsesLatestCanonicalAcrossRestartsWithoutCreate() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("manual-restore.sqlite").path
        let library = try Library(path: path, syncEnabled: true)
        let original = remote(url: "text://manual-fixture", text: "Original quote.")
        try library.apply(page([original]), after: nil)
        let local = try XCTUnwrap(library.articles().first)
        try library.saveNote(id: local.id, text: "Retained note")
        let highlight = try library.addHighlight(articleId: local.id, content: local.text, range: NSRange(location: 0, length: 8))
        try library.removeDownloads()
        let reopened = try Library(path: path, syncEnabled: true)
        let latest = remote(id: original.id, url: original.url, text: "Latest canonical text.", title: "Latest title", read: true, favorite: true)
        try reopened.apply(page([latest], cursor: "latest"), after: "page-1")
        XCTAssertFalse(try reopened.articles().first!.isDownloaded)
        XCTAssertTrue(try reopened.restoreDownloadedText(id: local.id))
        let restored = try XCTUnwrap(reopened.articles().first)
        XCTAssertEqual(restored.text, latest.text); XCTAssertEqual(restored.title, latest.title)
        XCTAssertFalse(restored.downloadSuppressed); XCTAssertNil(restored.error)
        XCTAssertEqual(restored.note, "Retained note"); XCTAssertTrue(restored.isRead); XCTAssertTrue(restored.isFavorite)
        XCTAssertEqual(try reopened.articleServerID(local.id), original.id)
        XCTAssertEqual(try reopened.canonicalTextSnapshot(articleID: local.id)?.contentHash, Highlight.contentHash(restored.text))
        XCTAssertEqual(try reopened.highlights(articleId: local.id).first?.id, highlight.id)
        let retained = try XCTUnwrap(reopened.textSnapshots(articleID: local.id).first { $0.text == local.text })
        XCTAssertNotNil(highlight.range(in: retained.text)); XCTAssertNil(highlight.range(in: restored.text))
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
        let resumed = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try resumed.articles().first?.text, latest.text)
        XCTAssertFalse(try resumed.articles().first!.downloadSuppressed)
        let api = FixtureLibraryAPI()
        api.onPull = { [self] cursor in XCTAssertEqual(cursor, "latest"); return page([], cursor: "latest") }
        try await resumed.sync(session: session(), client: api)
        XCTAssertTrue(api.pushes.isEmpty)
        XCTAssertTrue(try resumed.restoreDownloadedText(id: local.id))
        XCTAssertEqual(try resumed.syncState().pendingCount, 0)
    }

    func testRestoreWithoutCanonicalClearsSuppressionForSafePullAndDoesNotResurrectDeletion() throws {
        let library = try Library(syncEnabled: true)
        var unavailable = remote(url: "text://manual-unavailable", text: "")
        unavailable.contentUnavailable = true
        try library.apply(page([unavailable]), after: nil)
        let local = try XCTUnwrap(library.articles().first)
        try library.removeDownloads()
        XCTAssertFalse(try library.restoreDownloadedText(id: local.id))
        XCTAssertFalse(try library.articles().first!.downloadSuppressed)
        XCTAssertEqual(try library.articles().first?.error, NativeLibraryError.contentUnavailable.errorDescription)
        try library.apply(page([remote(id: unavailable.id, url: unavailable.url, text: "Safely pulled text")], cursor: "available"), after: "page-1")
        XCTAssertEqual(try library.articles().first?.text, "Safely pulled text")
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        try library.delete(id: local.id)
        XCTAssertFalse(try library.restoreDownloadedText(id: local.id))
        XCTAssertFalse(try library.restoreDownloadedText(id: "missing"))
        XCTAssertTrue(try library.articles().isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 1)
    }

    func testRemoteDeleteWinsAndRetainsAnnotationsAndOriginalSnapshot() throws {
        let library = try Library(syncEnabled: true)
        let remote = remote(text: "Keep this original quote.")
        try library.apply(page([remote]), after: nil)
        let article = try XCTUnwrap(library.articles().first)
        try library.saveNote(id: article.id, text: "Recoverable note")
        let highlight = try library.addHighlight(articleId: article.id, content: article.text, range: NSRange(location: 0, length: 4))
        try library.toggleFavorite(id: article.id)
        let deletion = NativeLibraryPage(protocolVersion: 1, changes: [NativeLibraryChange(revision: "2", id: remote.id, deleted: true, article: nil)], cursor: "deleted", hasMore: false)
        try library.apply(deletion, after: "page-1")
        XCTAssertTrue(try library.articles().isEmpty)
        XCTAssertEqual(try library.highlights(articleId: article.id).first?.id, highlight.id)
        XCTAssertTrue(try library.textSnapshots(articleID: article.id).contains { $0.text == article.text })
        try library.apply(page([remote], cursor: "stale-create"), after: "deleted")
        XCTAssertTrue(try library.articles().isEmpty)
        let batch = try library.prepareBatch()
        let ack = NativeLibraryAcknowledgment(protocolVersion: 1, results: batch.map { NativeLibraryMutationResult(mutationId: $0.mutation.mutationId, status: "deleted", articleId: remote.id) })
        try library.acknowledge(ack, batch: batch)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testLocalDeleteRemainsHiddenAcrossPullAndMapsToDeduplicatedServerID() throws {
        let library = try Library(syncEnabled: true)
        let article = try library.saveURL("https://example.com/delete")
        let frozenCreate = try library.prepareBatch()
        try library.delete(id: article.id)
        let actualID = UUID().uuidString
        try library.acknowledge(FixtureLibraryAPI.ack(frozenCreate.map(\.mutation), serverID: actualID), batch: frozenCreate)
        try library.apply(page([remote(id: actualID, url: article.url)]), after: nil)
        XCTAssertTrue(try library.articles().isEmpty)
        let delete = try library.prepareBatch()
        XCTAssertEqual(delete.count, 1); XCTAssertEqual(delete[0].mutation.kind, "delete")
        XCTAssertEqual(delete[0].mutation.articleId, actualID)
    }

    func testPaginationRestartsFromLastCommittedPageAndInvalidPageDoesNotPartiallyApply() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path, syncEnabled: true)
        let first = remote(), second = remote(url: "https://example.com/second")
        let api = FixtureLibraryAPI()
        api.onPull = { [self] cursor in
            if cursor == nil { return page([first], cursor: "after-first", more: true) }
            throw NativeLibraryError.unavailable
        }
        do { try await library.sync(session: session(), client: api); XCTFail("Expected page failure") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
        XCTAssertEqual(try library.articles().count, 1)
        XCTAssertEqual(try library.syncCursor(), "after-first")
        let resumed = try Library(path: path, syncEnabled: true)
        let retry = FixtureLibraryAPI()
        retry.onPull = { [self] cursor in
            XCTAssertEqual(cursor, "after-first")
            return page([second], cursor: "after-second")
        }
        try await resumed.sync(session: session(), client: retry)
        XCTAssertEqual(try resumed.articles().count, 2)
        // A real SQLite failure after the first row must roll back both that row and the cursor.
        try await resumed.database.write { db in
            try db.execute(sql: "CREATE TRIGGER fixture_abort BEFORE INSERT ON article WHEN NEW.title = 'Reject' BEGIN SELECT RAISE(ABORT, 'fixture'); END")
        }
        let accepted = remote(url: "https://example.com/atomic"), rejected = remote(title: "Reject")
        XCTAssertThrowsError(try resumed.apply(page([accepted, rejected], cursor: "bad-page"), after: "after-second"))
        XCTAssertEqual(try resumed.articles().count, 2)
        XCTAssertEqual(try resumed.syncCursor(), "after-second")
        let rolledBack = try await resumed.database.read { try String.fetchOne($0, sql: "SELECT localID FROM native_mapping WHERE serverID = ?", arguments: [accepted.id]) }
        XCTAssertNil(rolledBack)
    }

    func testMalformedHashOrDateOrAcknowledgmentLeavesCursorAndQueueUntouched() throws {
        let library = try Library(syncEnabled: true)
        let article = try library.saveURL("https://example.com/validation")
        let batch = try library.prepareBatch()
        let wrongID = NativeLibraryAcknowledgment(protocolVersion: 1, results: [NativeLibraryMutationResult(mutationId: UUID().uuidString, status: "applied", articleId: article.id)])
        XCTAssertThrowsError(try library.acknowledge(wrongID, batch: batch))
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        let good = remote()
        let corrupt = NativeLibraryArticle(id: UUID().uuidString, url: good.url, title: good.title, text: good.text, contentHash: String(repeating: "0", count: 64), format: good.format, isRead: false, isFavorite: false, isArchived: false, createdAt: good.createdAt, updatedAt: good.updatedAt)
        XCTAssertThrowsError(try library.apply(page([good, corrupt]), after: nil))
        XCTAssertNil(try library.syncCursor()); XCTAssertEqual(try library.articles().count, 1)
        let backwards = NativeLibraryArticle(id: good.id, url: good.url, title: good.title, text: good.text, contentHash: good.contentHash, format: good.format, isRead: false, isFavorite: false, isArchived: false, createdAt: good.updatedAt, updatedAt: good.createdAt)
        XCTAssertThrowsError(try library.apply(page([backwards]), after: nil))
        try library.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation)), batch: batch)
        XCTAssertNil(try library.syncCursor()) // ACK is never a pull cursor.
    }

    func testOversizedContentIsDurableAndDoesNotBlockOtherArticles() async throws {
        let library = try Library(syncEnabled: true)
        let large = try library.saveURL("https://example.com/large")
        let oversized = String(repeating: "👋", count: 100_001)
        XCTAssertThrowsError(try library.saveContent(id: large.id, title: "Large", text: oversized)) { error in
            XCTAssertEqual(error as? NativeLibraryError, .tooLarge)
        }
        XCTAssertEqual(try library.articles().first?.text, oversized)
        XCTAssertNotNil(try library.articles().first?.error)
        let small = try library.saveURL("https://example.com/small")
        let api = FixtureLibraryAPI()
        do { try await library.sync(session: session(), client: api); XCTFail("Expected queued oversize error") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .tooLarge) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.articleId), [small.id])
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        try library.saveContent(id: large.id, title: "Now small", text: "Fits")
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testTextOnlyAssignmentDoesNotOverlayUnrelatedRemoteFlags() throws {
        let library = try Library(syncEnabled: true)
        let original = remote(read: false, favorite: false)
        try library.apply(page([original]), after: nil)
        let local = try XCTUnwrap(library.articles().first)
        try library.saveContent(id: local.id, title: "New local title", text: "New local content")
        try library.apply(page([remote(id: original.id, read: true, favorite: true, archived: true)], cursor: "page-2"), after: "page-1")
        let overlaid = try XCTUnwrap(library.articles().first)
        XCTAssertEqual(overlaid.title, "New local title"); XCTAssertEqual(overlaid.text, "New local content")
        XCTAssertTrue(overlaid.isRead); XCTAssertTrue(overlaid.isFavorite); XCTAssertTrue(overlaid.isArchived)
    }

    func testOutboxFailureRollsBackArticleAndSnapshotsAtomically() throws {
        let library = try Library(syncEnabled: true)
        let local = try library.saveURL("https://example.com/atomic-write")
        try library.saveContent(id: local.id, title: "Before", text: "Original")
        let batch = try library.prepareBatch()
        try library.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation)), batch: batch)
        let snapshotCount = try library.textSnapshots(articleID: local.id).count
        try library.database.write { try $0.execute(sql: "CREATE TRIGGER fixture_queue_failure BEFORE INSERT ON native_pending BEGIN SELECT RAISE(ABORT, 'fixture'); END") }
        XCTAssertThrowsError(try library.toggleRead(id: local.id))
        XCTAssertThrowsError(try library.toggleFavorite(id: local.id))
        XCTAssertThrowsError(try library.saveContent(id: local.id, title: "After", text: "Replacement"))
        XCTAssertThrowsError(try library.delete(id: local.id))
        let article = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(article.isRead); XCTAssertFalse(article.isFavorite)
        XCTAssertEqual(article.title, "Before"); XCTAssertEqual(article.text, "Original")
        XCTAssertEqual(try library.textSnapshots(articleID: local.id).count, snapshotCount)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testDeletingNeverSentOversizedArticleSupersedesItsBlockedCreate() async throws {
        let library = try Library(syncEnabled: true)
        let article = try library.saveURL("https://example.com/too-large-delete")
        XCTAssertThrowsError(try library.saveContent(id: article.id, title: "Large", text: String(repeating: "a", count: 200_001)))
        try library.delete(id: article.id)
        let api = FixtureLibraryAPI()
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["delete"])
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testBatchLimitsAndPerArticleOrderingResolveAliasesBeforeFreezingUpdates() async throws {
        let library = try Library(syncEnabled: true)
        let primary = try library.saveURL("https://example.com/alias")
        try library.toggleFavorite(id: primary.id)
        let mappedID = UUID().uuidString.lowercased()
        for number in 0..<30 { _ = try library.saveURL("https://example.com/batch/\(number)") }
        let api = FixtureLibraryAPI()
        api.onPush = { mutations in
            XCTAssertLessThanOrEqual(mutations.count, 25)
            XCTAssertLessThanOrEqual(try NativeLibraryWire.encoder().encode(NativeLibraryWire.Batch(mutations: mutations)).count, 1_048_576)
            return NativeLibraryAcknowledgment(protocolVersion: 1, results: mutations.map {
                let actual = $0.kind == "create" && $0.articleId == primary.id ? mappedID : $0.articleId
                return NativeLibraryMutationResult(mutationId: $0.mutationId, status: "applied", articleId: actual)
            })
        }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articleServerID(primary.id), mappedID)
        let update = try XCTUnwrap(api.pushes.flatMap { $0 }.first { $0.kind == "update" })
        XCTAssertEqual(update.articleId, mappedID)
        XCTAssertEqual(api.pushes.flatMap { $0 }.count, 32)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testUpgradeWithExistingHighlightsRemovesUniqueURLAndSnapshotsLegacyText() throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("legacy.sqlite").path
        let old = try DatabaseQueue(path: path)
        var migration = DatabaseMigrator()
        migration.registerMigration("v1") { db in
            try db.execute(sql: """
                CREATE TABLE article(id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
                    text TEXT NOT NULL, note TEXT NOT NULL, isRead BOOLEAN NOT NULL, isFavorite BOOLEAN NOT NULL,
                    createdAt DATETIME NOT NULL, error TEXT, downloadSuppressed BOOLEAN NOT NULL DEFAULT 0);
                CREATE TABLE highlight(id TEXT PRIMARY KEY, articleId TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
                    text TEXT NOT NULL, startOffset INTEGER NOT NULL, endOffset INTEGER NOT NULL,
                    contextPrefix TEXT NOT NULL, contextSuffix TEXT NOT NULL, anchorContentHash TEXT NOT NULL,
                    color TEXT NOT NULL, createdAt DATETIME NOT NULL, version INTEGER NOT NULL);
                INSERT INTO article VALUES ('legacy-id', 'https://example.com/legacy', 'Legacy', 'Saved quote.', 'Saved note', 1, 1, '2026-10-01 00:00:00', NULL, 0);
                """)
            try db.execute(sql: "INSERT INTO highlight VALUES ('legacy-highlight', 'legacy-id', 'Saved', 0, 5, '', ' quote.', ?, 'yellow', '2026-10-01 00:00:00', 1)", arguments: [Highlight.contentHash("Saved quote.")])
        }
        migration.registerMigration("v2-highlights") { _ in }
        migration.registerMigration("v3-download-storage") { _ in }
        try migration.migrate(old)
        let upgraded = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try upgraded.articles().first?.id, "legacy-id")
        XCTAssertEqual(try upgraded.highlights(articleId: "legacy-id").first?.text, "Saved")
        XCTAssertEqual(try upgraded.textSnapshots(articleID: "legacy-id").first?.text, "Saved quote.")
        XCTAssertEqual(try upgraded.syncState().pendingCount, 1)
        let upload = try upgraded.prepareBatch()
        XCTAssertNotNil(UUID(uuidString: upload[0].mutation.articleId))
        XCTAssertEqual(upload[0].localID, "legacy-id")
        try upgraded.apply(page([remote(url: "https://example.com/legacy"), remote(url: "https://example.com/legacy")]), after: nil)
        XCTAssertEqual(try upgraded.articles().count, 3)
        XCTAssertEqual(try upgraded.highlights(articleId: "legacy-id").count, 1)
    }

    func testDuplicateURLHydrationTargetsBAndNoOpACKRestoresCanonicalOnIncrementalFeed() async throws {
        let library = try Library(syncEnabled: true)
        let a = remote(text: "Canonical A"), b = remote(text: "Canonical B")
        let api = FixtureLibraryAPI()
        api.onPull = { [self] cursor in
            if cursor == nil { return page([a, b], cursor: "initial") }
            return page([], cursor: "initial") // No-op create does not produce a ledger revision.
        }
        try await library.sync(session: session(), client: api)
        let localA = try XCTUnwrap(library.articles().first { try library.articleServerID($0.id) == a.id })
        let localB = try XCTUnwrap(library.articles().first { try library.articleServerID($0.id) == b.id })
        try library.saveContent(id: localB.id, title: "Publisher", text: "Different publisher text")
        let quote = try library.addHighlight(articleId: localB.id, content: "Different publisher text", range: NSRange(location: 0, length: 9))
        api.onPush = { mutations in
            XCTAssertEqual(mutations.map(\.articleId), [b.id])
            return FixtureLibraryAPI.ack(mutations)
        }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articles().first { $0.id == localA.id }?.text, "Canonical A")
        XCTAssertEqual(try library.articles().first { $0.id == localB.id }?.text, "Canonical B")
        XCTAssertEqual(try library.articleServerID(localB.id), b.id)
        XCTAssertNil(quote.range(in: "Canonical B"))
        XCTAssertTrue(try library.textSnapshots(articleID: localB.id).contains { $0.text == "Different publisher text" })
        XCTAssertEqual(try library.highlights(articleId: localB.id).first?.id, quote.id)
        try library.toggleFavorite(id: localB.id)
        try await library.sync(session: session(), client: api)
        try library.delete(id: localB.id)
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["create", "update", "delete"])
        XCTAssertEqual(try library.articles().map(\.id), [localA.id])
        XCTAssertEqual(api.cursors.compactMap { $0 }, ["initial", "initial", "initial"])
    }

    func testAlreadyMappedCreateCannotAcceptIdentityChangingAcknowledgment() throws {
        let library = try Library(syncEnabled: true)
        let a = remote(), b = remote()
        try library.apply(page([a, b]), after: nil)
        let localB = try XCTUnwrap(library.articles().first { try library.articleServerID($0.id) == b.id })
        try library.saveContent(id: localB.id, title: "Publisher", text: "Downloaded")
        let batch = try library.prepareBatch()
        XCTAssertEqual(batch.first?.mutation.articleId, b.id)
        XCTAssertThrowsError(try library.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation), serverID: a.id), batch: batch))
        XCTAssertEqual(try library.articleServerID(localB.id), b.id)
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        try library.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation)), batch: batch)
        XCTAssertEqual(try library.articles().count, 2)
    }

    func testQuarantinedMappedHydrationAllowsFlagPushPullAndDeletionAcrossRestart() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("quarantine.sqlite").path
        let library = try Library(path: path, syncEnabled: true)
        let b = remote(text: "Canonical B")
        let api = FixtureLibraryAPI()
        api.onPull = { [self] _ in page([b], cursor: "initial") }
        try await library.sync(session: session(), client: api)
        let localB = try XCTUnwrap(library.articles().first)
        XCTAssertThrowsError(try library.saveContent(id: localB.id, title: "Too large", text: String(repeating: "a", count: 200_001)))
        try library.toggleFavorite(id: localB.id)
        let unrelated = remote(url: "https://example.com/unrelated")
        api.onPull = { [self] cursor in
            XCTAssertEqual(cursor, "initial")
            return page([unrelated], cursor: "after-unrelated")
        }
        do { try await library.sync(session: session(), client: api); XCTFail("Expected visible quarantine error") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .tooLarge) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["update"])
        XCTAssertEqual(try library.articles().count, 2)
        XCTAssertEqual(try library.syncCursor(), "after-unrelated")
        XCTAssertNotNil(try library.syncState().lastSuccess)
        try library.delete(id: localB.id)
        let resumed = try Library(path: path, syncEnabled: true)
        let next = remote(url: "https://example.com/next")
        api.onPull = { [self] cursor in
            XCTAssertEqual(cursor, "after-unrelated")
            return page([next], cursor: "after-next")
        }
        try await resumed.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["update", "delete"])
        XCTAssertEqual(api.pushes.last?.first?.articleId, b.id)
        XCTAssertEqual(try resumed.articles().count, 2)
        XCTAssertEqual(try resumed.syncState().pendingCount, 0)
        XCTAssertNil(try resumed.syncState().lastError)
    }

    func testMetadataOnlyUnavailableContentKeepsIdentityAndFlagsWithDurableOfflineError() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("metadata.sqlite").path
        let library = try Library(path: path, syncEnabled: true)
        var metadata = remote(text: "", read: true, favorite: true)
        metadata.contentUnavailable = true
        let wire = try NativeLibraryWire.encoder().encode(page([metadata]))
        let decoded = try NativeLibraryWire.decoder().decode(NativeLibraryPage.self, from: wire)
        XCTAssertEqual(decoded.changes.first?.article?.contentUnavailable, true)
        try library.apply(decoded, after: nil)
        let row = try XCTUnwrap(library.articles().first)
        XCTAssertFalse(row.isDownloaded); XCTAssertTrue(row.isRead); XCTAssertTrue(row.isFavorite)
        XCTAssertEqual(row.error, NativeLibraryError.contentUnavailable.errorDescription)
        XCTAssertEqual(try library.canonicalTextSnapshot(articleID: row.id)?.contentUnavailable, true)
        let reopened = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try reopened.articles().first?.error, row.error)
        try reopened.removeDownloads()
        XCTAssertEqual(try reopened.articles().first?.error, row.error)
        try reopened.toggleFavorite(id: row.id)
        let batch = try reopened.prepareBatch()
        XCTAssertEqual(batch.first?.mutation.articleId, metadata.id)
        XCTAssertEqual(batch.first?.mutation.patch, NativeLibraryPatch(isFavorite: false))
        try reopened.acknowledge(FixtureLibraryAPI.ack(batch.map(\.mutation)), batch: batch)
        try reopened.apply(page([remote(id: metadata.id, text: "Now available")], cursor: "available"), after: "page-1")
        XCTAssertFalse(try reopened.articles().first!.isDownloaded) // Explicit cleanup remains suppressed.
        XCTAssertEqual(try reopened.canonicalTextSnapshot(articleID: row.id)?.text, "Now available")
        XCTAssertNil(try reopened.articles().first?.error)
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
    }

    func testRecoveryExportIncludesSnapshotsAndHiddenArticleAnnotationsWithoutSyncSecrets() throws {
        let library = try Library(syncEnabled: true)
        let remote = remote(text: "Legacy saved quote.")
        try library.apply(page([remote]), after: nil)
        let article = try XCTUnwrap(library.articles().first)
        try library.saveNote(id: article.id, text: "Retained local note")
        let highlight = try library.addHighlight(articleId: article.id, content: article.text, range: NSRange(location: 0, length: 6))
        try library.apply(page([self.remote(id: remote.id, text: "Canonical replacement")], cursor: "replacement"), after: "page-1")
        let deletion = NativeLibraryPage(protocolVersion: 1, changes: [NativeLibraryChange(revision: "3", id: remote.id, deleted: true, article: nil)], cursor: "deleted", hasMore: false)
        try library.apply(deletion, after: "replacement")
        XCTAssertTrue(try library.articles().isEmpty)
        let localDelete = try library.saveURL("https://example.com/export-local-delete")
        try library.saveContent(id: localDelete.id, title: "Local deleted", text: "Retained deleted quote.")
        let localHighlight = try library.addHighlight(articleId: localDelete.id, content: "Retained deleted quote.", range: NSRange(location: 0, length: 8))
        try library.saveNote(id: localDelete.id, text: "Deleted local note")
        try library.delete(id: localDelete.id)
        XCTAssertTrue(try library.articles().isEmpty)
        let data = try library.exportJSON()
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let restored = try decoder.decode(LibraryBackup.self, from: data)
        XCTAssertEqual(restored.formatVersion, 4)
        XCTAssertEqual(restored.articles.first { $0.id == article.id }?.note, "Retained local note")
        XCTAssertEqual(restored.articles.first { $0.id == localDelete.id }?.note, "Deleted local note")
        XCTAssertTrue(restored.highlights.contains { $0.id == highlight.id })
        XCTAssertTrue(restored.highlights.contains { $0.id == localHighlight.id })
        let snapshot = try XCTUnwrap(restored.textSnapshots?.first { $0.localID == article.id && $0.text == "Legacy saved quote." })
        XCTAssertNotNil(highlight.range(in: snapshot.text))
        XCTAssertTrue(restored.textSnapshots?.contains { $0.localID == localDelete.id && $0.text == "Retained deleted quote." } == true)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(json.keys), Set(["formatVersion", "articles", "highlights", "textSnapshots", "notes", "annotationStates", "permanentAnnotationDeletions", "annotationRecovery", "annotationImports", "canonicalTextSnapshots"]))
        for forbidden in ["token", "native_pending", "mutationId", "namespace", "cursor"] {
            XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("\"\(forbidden)\""))
        }
        // Optional snapshots preserve decoding compatibility with existing format-2 JSON.
        var old = json; old.removeValue(forKey: "textSnapshots"); old["formatVersion"] = 2
        let oldBackup = try decoder.decode(LibraryBackup.self, from: JSONSerialization.data(withJSONObject: old))
        XCTAssertNil(oldBackup.textSnapshots)
    }

    func testPaginationAcceptsEmptyTerminalPageAtTheLastCommittedCursor() async throws {
        let library = try Library(syncEnabled: true)
        let first = remote()
        let api = FixtureLibraryAPI()
        api.onPull = { [self] cursor in
            if cursor == nil { return page([first], cursor: "end", more: true) }
            return page([], cursor: "end")
        }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.cursors.count, 2)
        XCTAssertEqual(try library.articles().count, 1)
        XCTAssertEqual(try library.syncCursor(), "end")
    }

    func testCancelledEpochCannotAcknowledgeOrOverwriteNewRunState() async throws {
        let library = try Library(syncEnabled: true)
        _ = try library.saveURL("https://example.com/cancel")
        let old = FixtureLibraryAPI()
        var waiting: CheckedContinuation<NativeLibraryAcknowledgment, Error>?
        old.onPush = { _ in try await withCheckedThrowingContinuation { waiting = $0 } }
        let first = Task { try await library.sync(session: session(), client: old) }
        for _ in 0..<1000 { if waiting != nil { break }; await Task.yield() }
        guard let waiting else { XCTFail("Transport did not suspend"); return }
        library.cancelSync()
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        let fresh = FixtureLibraryAPI()
        try await library.sync(session: session(), client: fresh)
        let success = try library.syncState().lastSuccess
        waiting.resume(returning: FixtureLibraryAPI.ack(old.pushes[0]))
        do { try await first.value; XCTFail("Stale request applied") }
        catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertEqual(try library.syncState().lastSuccess, success)
        XCTAssertNil(try library.syncState().lastError)
        XCTAssertTrue(old.cursors.isEmpty)
    }
}
