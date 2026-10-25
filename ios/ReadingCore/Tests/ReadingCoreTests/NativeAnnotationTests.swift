import XCTest
import GRDB
@testable import ReadingCore

@MainActor private final class AnnotationFixtureAPI: NativeLibraryAPI {
    var pushes: [[NativeLibraryMutation]] = []
    var onPush: (([NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment)?
    var onPull: ((String?) async throws -> NativeLibraryPage)?
    func verify(_ session: NativeAuthSession) async throws -> NativeAuthSession { session }
    func push(_ session: NativeAuthSession, mutations: [NativeLibraryMutation]) async throws -> NativeLibraryAcknowledgment {
        pushes.append(mutations)
        if let onPush { return try await onPush(mutations) }
        return Self.ack(mutations)
    }
    func pull(_ session: NativeAuthSession, cursor: String?) async throws -> NativeLibraryPage {
        if let onPull { return try await onPull(cursor) }
        return NativeLibraryPage(protocolVersion: 2, changes: [], cursor: "done", hasMore: false)
    }
    static func ack(_ mutations: [NativeLibraryMutation], status: String? = nil, articleID: String? = nil, effectRevision: String? = nil, permanentDeletion: Bool? = nil) -> NativeLibraryAcknowledgment {
        NativeLibraryAcknowledgment(protocolVersion: 2, results: mutations.map {
            NativeLibraryMutationResult(mutationId: $0.mutationId, status: status ?? ($0.kind.hasSuffix("delete") ? "deleted" : "applied"), articleId: articleID ?? $0.articleId, annotationId: $0.annotationID, effectRevision: effectRevision, permanentDeletion: permanentDeletion)
        })
    }
}

@MainActor final class NativeAnnotationTests: XCTestCase {
    private func session() -> NativeAuthSession {
        NativeAuthSession(user: NativeAuthUser(id: "annotation-fixture", name: "Fixture", email: "fixture@example.com"), token: "fixture-only-token", expiresAt: .distantFuture, server: URL(string: "https://sync.example.com")!)
    }
    private func remote(id: String = UUID().uuidString.lowercased(), text: String = "Canonical 👋 quote\n\nRepeat quote") -> NativeLibraryArticle {
        NativeLibraryArticle(id: id, url: "https://example.com/article", title: "Fixture", text: text, contentHash: Highlight.contentHash(text), format: "paper-drive-text-v1", isRead: false, isFavorite: false, isArchived: false, createdAt: Date(timeIntervalSince1970: 100), updatedAt: Date(timeIntervalSince1970: 200))
    }
    private func page(_ article: NativeLibraryArticle, notes: [LibraryNote] = [], highlights: [NativeAnnotationHighlight] = [], deleted: [NativeAnnotationDeletion] = [], cursor: String = "page") -> NativeLibraryPage {
        NativeLibraryPage(protocolVersion: 2, changes: [NativeLibraryChange(revision: "1", id: article.id, deleted: false, article: article,
            annotations: NativeAnnotationSnapshot(complete: true, notes: notes, highlights: highlights, deleted: deleted))], cursor: cursor, hasMore: false)
    }
    private func storedDeferred(_ library: Library) throws -> [NativeAnnotationDeferred] {
        try library.database.read { try NativeAnnotationDeferred.fetchAll($0, sql: "SELECT * FROM native_annotation_deferred ORDER BY sequence") }
    }
    private func storedPending(_ library: Library) throws -> [NativeLibraryPending] {
        try library.database.read { try library.pending(in: $0) }
    }
    private func storedState(_ library: Library, kind: String, id: String, articleId: String) throws -> NativeAnnotationState? {
        try library.database.read { try NativeAnnotationState.fetchOne($0, sql: "SELECT * FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId]) }
    }
    private func atRevision(_ change: NativeLibraryChange, _ revision: String) -> NativeLibraryChange {
        NativeLibraryChange(revision: revision, id: change.id, deleted: change.deleted, article: change.article, annotations: change.annotations)
    }
    private func fixture(_ article: NativeLibraryArticle? = nil) throws -> (Library, NativeLibraryArticle, String) {
        let library = try Library()
        try library.enableAnnotationSync(session: session())
        let article = article ?? remote()
        try library.apply(page(article), after: nil)
        return (library, article, try XCTUnwrap(library.articles().first?.id))
    }
    private func webNote(article: NativeLibraryArticle, id: String = UUID().uuidString.lowercased(), content: String = "Same text", highlightID: String? = nil) -> LibraryNote {
        LibraryNote(id: id, articleId: article.id, highlightId: highlightID, content: content, createdAt: article.createdAt, updatedAt: article.updatedAt)
    }
    private func wireHighlight(article: NativeLibraryArticle, id: String = UUID().uuidString.lowercased(), color: HighlightColor = .yellow, mismatch: Bool = false) -> NativeAnnotationHighlight {
        let range = (article.text as NSString).range(of: "quote")
        let hash = mismatch ? Highlight.contentHash("Older text quote quote") : article.contentHash
        let source = NativeAnnotationSourceAnchor(space: "local-text-v1", text: "quote", startOffset: range.location, endOffset: NSMaxRange(range), contextPrefix: "", contextSuffix: "", contentHash: hash)
        return NativeAnnotationHighlight(id: id, articleId: article.id, color: color, sourceAnchor: source,
            canonicalAnchor: mismatch ? nil : NativeAnnotationCanonicalAnchor(text: "quote", startOffset: range.location, endOffset: NSMaxRange(range), contentHash: hash),
            resolution: mismatch ? "unresolved" : "anchored", createdAt: article.createdAt, updatedAt: article.updatedAt)
    }

    func testIndependentEqualTextNotesAndAllEightColorsPreserveIdentities() async throws {
        let (library, article, localID) = try fixture()
        let notes = [webNote(article: article), webNote(article: article)]
        let highlights = HighlightColor.allCases.map { wireHighlight(article: article, color: $0) }
        try library.apply(page(article, notes: notes, highlights: highlights), after: "page")
        XCTAssertEqual(try library.notes(articleId: localID).map(\.id), notes.map(\.id).sorted())
        XCTAssertEqual(Set(try library.highlights(articleId: localID).map(\.color)), Set(HighlightColor.allCases))
        XCTAssertEqual(try library.highlights(articleId: localID).count, 8)
        let first = try library.createNote(articleId: localID, content: "Same text")
        let second = try library.createNote(articleId: localID, content: "Same text")
        XCTAssertNotEqual(first.id, second.id)
        try library.updateNote(id: first.id, content: "Edited")
        let highlight = try XCTUnwrap(library.highlights(articleId: localID).first)
        for color in HighlightColor.allCases { try library.setHighlightColor(id: highlight.id, color: color) }
        let api = AnnotationFixtureAPI()
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(Set(api.pushes.flatMap { $0 }.compactMap { $0.patch?.color }), Set(HighlightColor.allCases))
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertEqual(try library.notes(articleId: localID).first(where: { $0.id == first.id })?.content, "Edited")
    }

    func testLegacyImportRestartStableIDsAndOneCursorResetAfterArticleMapping() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-legacy-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("fixture.sqlite").path
        let library = try Library(path: path)
        let article = try library.saveURL("https://example.com/legacy")
        try library.saveContent(id: article.id, title: "Legacy", text: "Original quote")
        try library.saveNote(id: article.id, text: "Legacy inline")
        let highlight = try library.addHighlight(articleId: article.id, content: "Original quote", range: NSRange(location: 9, length: 5))
        try library.enableSync(session: session())
        try await library.database.write { try $0.execute(sql: "UPDATE native_sync_state SET cursor = 'old-v1' WHERE singleton = 1") }
        try library.enableAnnotationSync(session: session())
        XCTAssertNil(try library.syncCursor())
        let noteID = try XCTUnwrap(library.notes(articleId: article.id).first?.id)
        XCTAssertNotEqual(noteID, article.id)
        try await library.database.write { try $0.execute(sql: "UPDATE native_sync_state SET cursor = 'v2-cursor' WHERE singleton = 1") }
        let reopened = try Library(path: path, syncEnabled: true)
        try reopened.enableAnnotationSync(session: session())
        XCTAssertEqual(try reopened.syncCursor(), "v2-cursor")
        XCTAssertEqual(try reopened.notes(articleId: article.id).map(\.id), [noteID])
        XCTAssertEqual(try reopened.syncState().pendingCount, 3)
        let api = AnnotationFixtureAPI()
        let serverID = UUID().uuidString.lowercased()
        api.onPush = { mutations in
            if mutations.first?.kind == "create" { return AnnotationFixtureAPI.ack(mutations, articleID: serverID) }
            XCTAssertEqual(mutations.first?.articleId, serverID)
            return AnnotationFixtureAPI.ack(mutations)
        }
        try await reopened.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), ["create", "highlight.create", "note.create"])
        XCTAssertEqual(api.pushes[1][0].highlightId, highlight.id)
        XCTAssertEqual(api.pushes[1][0].sourceAnchor?.contentHash, highlight.anchorContentHash)
        try reopened.enableAnnotationSync(session: session())
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
        XCTAssertEqual(try reopened.articles().first?.note, "Legacy inline")
    }

    func testHashMismatchRemainsUnresolvedAndSourceIsNeverRewritten() throws {
        let (library, article, localID) = try fixture()
        let highlight = wireHighlight(article: article, mismatch: true)
        try library.apply(page(article, highlights: [highlight]), after: "page")
        let stored = try XCTUnwrap(library.highlights(articleId: localID).first)
        XCTAssertEqual(stored.sourceAnchor, highlight.sourceAnchor)
        XCTAssertNil(stored.range(in: article.text))
        XCTAssertNil(stored.canonicalAnchor)
        let canonical = try library.addHighlight(articleId: localID, content: article.text, range: (article.text as NSString).range(of: "Canonical 👋"))
        XCTAssertEqual(canonical.sourceAnchor?.space, "paper-drive-text-v1")
        XCTAssertNotNil(canonical.range(in: article.text))
        try library.saveContent(id: localID, title: "Local", text: "Local quote")
        let local = try library.addHighlight(articleId: localID, content: "Local quote", range: NSRange(location: 6, length: 5))
        XCTAssertEqual(local.sourceAnchor?.space, "local-text-v1")
        XCTAssertNil(local.canonicalAnchor)
        XCTAssertNotNil(local.range(in: "Local quote"))
        var invalid = highlight
        invalid.canonicalAnchor = NativeAnnotationCanonicalAnchor(text: "quote", startOffset: highlight.sourceAnchor.startOffset, endOffset: highlight.sourceAnchor.endOffset, contentHash: article.contentHash)
        invalid.resolution = "anchored"
        XCTAssertThrowsError(try library.apply(page(article, highlights: [invalid]), after: "page"))
    }

    func testCompleteSnapshotsOverlayPendingFieldsAndIncompletePreservesCollections() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        let highlight = wireHighlight(article: article)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        try library.updateNote(id: note.id, content: "Pending local edit")
        try library.setHighlightColor(id: highlight.id, color: .gray)
        let unsent = try library.createNote(articleId: localID, content: "Offline create")
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        XCTAssertEqual(try library.notes(articleId: localID).first { $0.id == note.id }?.content, "Pending local edit")
        XCTAssertEqual(try library.highlights(articleId: localID).first?.color, .gray)
        XCTAssertTrue(try library.notes(articleId: localID).contains { $0.id == unsent.id })
        let incomplete = NativeLibraryPage(protocolVersion: 2, changes: [NativeLibraryChange(revision: "2", id: article.id, deleted: false, article: article,
            annotations: NativeAnnotationSnapshot(complete: false, reason: "annotation_limit"))], cursor: "limited", hasMore: false)
        try library.apply(incomplete, after: "page")
        XCTAssertEqual(try library.notes(articleId: localID).count, 2)
        XCTAssertEqual(try library.highlights(articleId: localID).count, 1)
        XCTAssertEqual(try library.articles().first?.error, NativeLibraryError.annotationLimit.errorDescription)
    }

    func testDeletionTombstonesBeatStaleCreatesUpdatesAndDoNotDeleteParent() async throws {
        let (library, article, localID) = try fixture()
        let highlight = wireHighlight(article: article)
        let note = webNote(article: article, highlightID: highlight.id)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        try library.updateNote(id: note.id, content: "Offline edit")
        try library.deleteHighlight(id: highlight.id)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
        let api = AnnotationFixtureAPI()
        api.onPush = { AnnotationFixtureAPI.ack($0, status: "deleted") }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articles().map(\.id), [localID])
        XCTAssertEqual(try library.articleServerID(localID), article.id)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        let created = try library.createNote(articleId: localID, content: "Delete this")
        try library.deleteNote(id: created.id)
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articles().count, 1)
    }

    func testLostACKFreezesPayloadAndNewerEditSurvivesOwnReceipt() async throws {
        let (library, _, localID) = try fixture()
        let note = try library.createNote(articleId: localID, content: "Original")
        let api = AnnotationFixtureAPI()
        api.onPush = { _ in throw NativeLibraryError.unavailable }
        do { try await library.sync(session: session(), client: api); XCTFail("Expected lost ACK") } catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
        let sent = try XCTUnwrap(api.pushes.first?.first)
        try library.updateNote(id: note.id, content: "Newer")
        let frozen = try library.prepareBatch()
        XCTAssertEqual(frozen.first?.mutation, sent)
        try library.acknowledge(AnnotationFixtureAPI.ack(frozen.map(\.mutation)), batch: frozen)
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        XCTAssertEqual(try library.notes(articleId: localID).first?.content, "Newer")
        api.onPush = nil
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.last?.first?.patch?.content, "Newer")
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testRecoveryFormatFourRetainsDeletedSourcesAndOldBackupDecodes() throws {
        let (library, article, localID) = try fixture()
        let highlight = wireHighlight(article: article)
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        try library.deleteNote(id: note.id)
        try library.deleteHighlight(id: highlight.id)
        try library.removeDownloads()
        let data = try library.exportJSON()
        let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: data)
        XCTAssertEqual(backup.formatVersion, 4)
        XCTAssertEqual(backup.notes?.first?.id, note.id)
        XCTAssertEqual(backup.highlights.first?.sourceAnchor, highlight.sourceAnchor)
        XCTAssertEqual(backup.highlights.first?.canonicalAnchor, highlight.canonicalAnchor)
        XCTAssertFalse(try XCTUnwrap(backup.annotationRecovery).isEmpty)
        XCTAssertEqual(backup.canonicalTextSnapshots?.first?.text, article.text)
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(json.contains(session().token))
        XCTAssertFalse(json.contains("mutationId"))
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        let old = Data("{\"formatVersion\":2,\"articles\":[],\"highlights\":[]}".utf8)
        XCTAssertNil(try JSONDecoder().decode(LibraryBackup.self, from: old).notes)
    }
    func testLegacyUppercaseHighlightUUIDReconcilesLowercaseReceiptAndSnapshot() throws {
        let (library, article, localID) = try fixture()
        let id = UUID().uuidString.uppercased()
        let wire = wireHighlight(article: article, id: id.lowercased())
        let source = wire.sourceAnchor
        let legacy = Highlight(id: id, articleId: localID, text: source.text, startOffset: source.startOffset, endOffset: source.endOffset,
            contextPrefix: source.contextPrefix, contextSuffix: source.contextSuffix, anchorContentHash: source.contentHash, color: .yellow, createdAt: article.createdAt, version: 1)
        try library.database.write { try legacy.insert($0) }
        try library.enableAnnotationSync(session: session())
        let batch = try library.prepareBatch()
        XCTAssertEqual(batch.first?.mutation.highlightId, id)
        let mutation = try XCTUnwrap(batch.first?.mutation)
        try library.acknowledge(NativeLibraryAcknowledgment(protocolVersion: 2,
            results: [NativeLibraryMutationResult(mutationId: mutation.mutationId, status: "applied", articleId: article.id, annotationId: id.lowercased())]), batch: batch)
        try library.apply(page(article, highlights: [wire]), after: "page")
        XCTAssertEqual(try library.highlights(articleId: localID).map(\.id), [id])
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testRemoteTombstoneDropsNeverSentDependentNoteAndRejectsStaleSnapshot() throws {
        let (library, article, localID) = try fixture()
        let highlight = wireHighlight(article: article)
        try library.apply(page(article, highlights: [highlight]), after: "page")
        let note = try library.createNote(articleId: localID, content: "Offline dependent note", highlightId: highlight.id)
        try library.apply(page(article, deleted: [NativeAnnotationDeletion(kind: "highlight", id: highlight.id)]), after: "page")
        XCTAssertTrue(try library.prepareBatch().isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        let stale = webNote(article: article, id: note.id, highlightID: highlight.id)
        try library.apply(page(article, notes: [stale], highlights: [highlight]), after: "page")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
        XCTAssertEqual(try library.articles().count, 1)
    }

    func testDeletedReceiptRetryPreservesParentMappingAndCursor() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let first = try library.prepareBatch()
        let retry = try library.prepareBatch()
        XCTAssertEqual(first.first?.mutation, retry.first?.mutation)
        let acknowledgment = AnnotationFixtureAPI.ack(first.map(\.mutation))
        try library.acknowledge(acknowledgment, batch: retry)
        XCTAssertEqual(try library.syncCursor(), "page")
        XCTAssertEqual(try library.articleServerID(localID), article.id)
        XCTAssertEqual(try library.articles().count, 1)
        XCTAssertThrowsError(try library.acknowledge(acknowledgment, batch: first))
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testSaveNoteUpdatesIndependentImportedUUIDAndRetainsInlineOriginal() throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/inline")
        try library.saveNote(id: article.id, text: "Inline original")
        try library.enableAnnotationSync(session: session())
        let id = try XCTUnwrap(library.notes(articleId: article.id).first?.id)
        try library.saveNote(id: article.id, text: "Independent edit")
        XCTAssertEqual(try library.notes(articleId: article.id).first?.id, id)
        XCTAssertEqual(try library.notes(articleId: article.id).first?.content, "Independent edit")
        XCTAssertEqual(try library.articles().first?.note, "Inline original")
        let mutations = try library.database.read { try library.pending(in: $0).map(\.mutation) }
        XCTAssertEqual(mutations.last?.kind, "note.update")
        XCTAssertEqual(mutations.last?.patch?.content, "Independent edit")
    }

    func testArticleDeletionHidesChildrenAndExportsRecoverableIndependentRecords() throws {
        let (library, article, localID) = try fixture()
        let highlight = wireHighlight(article: article)
        let note = webNote(article: article, highlightID: highlight.id)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
        let deletion = NativeLibraryPage(protocolVersion: 2, changes: [NativeLibraryChange(revision: "2", id: article.id, deleted: true, article: nil)], cursor: "deleted", hasMore: false)
        try library.apply(deletion, after: "page")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
        let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
        XCTAssertTrue(backup.annotationStates?.allSatisfy(\.deleted) == true)
        XCTAssertTrue(backup.annotationRecovery?.contains { $0.annotationID == note.id } == true)
        XCTAssertTrue(backup.annotationRecovery?.contains { $0.annotationID == highlight.id } == true)
        try library.apply(page(article, notes: [note], highlights: [highlight]), after: "deleted")
        XCTAssertTrue(try library.articles().isEmpty)
    }

    func testOversizeNoteIsSavedAndQuarantinedWithoutBlockingAnotherArticle() async throws {
        let (library, article, localID) = try fixture()
        let other = remote(id: UUID().uuidString.lowercased(), text: "Other quote")
        try library.apply(page(other), after: "page")
        let otherID = try XCTUnwrap(library.articles().first { $0.id != localID }?.id)
        let content = String(repeating: "x", count: 200_001)
        let note = try library.createNote(articleId: localID, content: content)
        _ = try library.createNote(articleId: otherID, content: "Allowed")
        let api = AnnotationFixtureAPI()
        do { try await library.sync(session: session(), client: api); XCTFail("Expected quarantine") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .tooLarge) }
        XCTAssertEqual(api.pushes.flatMap { $0 }.count, 1)
        XCTAssertEqual(api.pushes.first?.first?.articleId, other.id)
        XCTAssertEqual(try library.notes(articleId: localID).first { $0.id == note.id }?.content, content)
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        XCTAssertEqual(try library.articleServerID(localID), article.id)
    }

    func testHistoricalWebSelectorsRemainRecoverableWithoutPinningFeed() async throws {
        let (library, article, localID) = try fixture()
        let sources = [
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "quote", startOffset: 0, endOffset: 5, contextPrefix: "", contextSuffix: "", contentHash: ""),
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "quote", startOffset: -1, endOffset: -5, contextPrefix: "old", contextSuffix: "context", contentHash: ""),
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "quote", startOffset: 0, endOffset: 99, contextPrefix: "", contextSuffix: "", contentHash: "old-invalid-hash"),
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: " \n\t", startOffset: 3, endOffset: 3, contextPrefix: "", contextSuffix: "", contentHash: ""),
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "", startOffset: Int.min, endOffset: Int.max, contextPrefix: "", contextSuffix: "", contentHash: ""),
            NativeAnnotationSourceAnchor(space: "web-dom-v1", text: "quote", startOffset: 0, endOffset: 5, contextPrefix: "legacy\0context", contextSuffix: String(repeating: "x", count: 2049), contentHash: "")
        ]
        let highlights = sources.map { source in
            NativeAnnotationHighlight(id: UUID().uuidString.lowercased(), articleId: article.id, color: .yellow, sourceAnchor: source,
                canonicalAnchor: nil, resolution: "unresolved", createdAt: article.createdAt, updatedAt: article.updatedAt)
        }
        let api = AnnotationFixtureAPI()
        api.onPull = { _ in self.page(article, notes: [self.webNote(article: article)], highlights: highlights, cursor: "legacy-complete") }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.syncCursor(), "legacy-complete")
        let stored = try library.highlights(articleId: localID)
        XCTAssertEqual(stored.count, sources.count)
        for remote in highlights {
            let local = try XCTUnwrap(stored.first { $0.id == remote.id })
            XCTAssertEqual(local.sourceAnchor, remote.sourceAnchor)
            XCTAssertEqual(local.text, remote.sourceAnchor.text)
            XCTAssertEqual(local.startOffset, remote.sourceAnchor.startOffset)
            XCTAssertEqual(local.endOffset, remote.sourceAnchor.endOffset)
            XCTAssertEqual(local.anchorContentHash, remote.sourceAnchor.contentHash)
            XCTAssertNil(local.canonicalAnchor)
            XCTAssertNil(local.range(in: article.text))
            XCTAssertEqual(local.resolution, "unresolved")
        }
        try library.enableAnnotationSync(session: session())
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        try library.setHighlightColor(id: highlights[0].id, color: .gray)
        api.onPull = nil
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.last?.first?.kind, "highlight.update")
        XCTAssertNil(api.pushes.last?.first?.sourceAnchor)
        let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
        XCTAssertEqual(backup.highlights.first { $0.id == highlights[0].id }?.sourceAnchor, sources[0])
    }

    func testMalformedWebProjectionIsDroppedButNativeValidationStaysStrict() throws {
        let (library, article, localID) = try fixture()
        var web = wireHighlight(article: article)
        web.sourceAnchor.space = "web-dom-v1"
        web.sourceAnchor.contentHash = ""
        // Even a seemingly exact derived range cannot authenticate an unknown/malformed source.
        try library.apply(page(article, highlights: [web]), after: "page")
        XCTAssertEqual(try library.highlights(articleId: localID).first?.resolution, "unresolved")
        XCTAssertNil(try library.highlights(articleId: localID).first?.canonicalAnchor)
        var invalidNative = wireHighlight(article: article)
        invalidNative.sourceAnchor.contentHash = ""
        XCTAssertThrowsError(try library.apply(page(article, highlights: [invalidNative]), after: "page"))
        invalidNative = wireHighlight(article: article)
        invalidNative.sourceAnchor.endOffset += 1
        XCTAssertThrowsError(try library.apply(page(article, highlights: [invalidNative]), after: "page"))
        invalidNative = wireHighlight(article: article)
        invalidNative.sourceAnchor.contextPrefix = String(repeating: "x", count: 2049)
        XCTAssertThrowsError(try library.apply(page(article, highlights: [invalidNative]), after: "page"))
    }

    func testNoteMoveKeepsLiveIdentityInBothParentSnapshotOrders() throws {
        for newParentFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: "page")
            var moved = note; moved.articleId = articleB.id
            let old = page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0]
            let new = page(articleB, notes: [moved]).changes[0]
            let changes = newParentFirst ? [new, old] : [old, new]
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: changes, cursor: "moved", hasMore: false), after: "page")
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
            XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
            XCTAssertEqual(try library.notes(articleId: localB).first?.content, note.content)
            // A repeated old-parent tombstone must remain scoped to that old parent.
            try library.apply(page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]), after: "moved")
            XCTAssertEqual(try library.notes(articleId: localB).count, 1)
        }
    }

    func testHighlightAndAttachedNoteMoveInBothParentSnapshotOrders() throws {
        for newParentFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote(text: articleA.text)
            let highlight = wireHighlight(article: articleA)
            let note = webNote(article: articleA, highlightID: highlight.id)
            try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: "page")
            var movedHighlight = highlight; movedHighlight.articleId = articleB.id
            var movedNote = note; movedNote.articleId = articleB.id
            let old = page(articleA, deleted: [NativeAnnotationDeletion(kind: "highlight", id: highlight.id), NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0]
            let new = page(articleB, notes: [movedNote], highlights: [movedHighlight]).changes[0]
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: newParentFirst ? [new, old] : [old, new], cursor: "moved", hasMore: false), after: "page")
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertTrue(try library.highlights(articleId: localA).isEmpty)
            XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
            XCTAssertEqual(try library.highlights(articleId: localB).first?.id, highlight.id)
            XCTAssertEqual(try library.highlights(articleId: localB).first?.sourceAnchor, highlight.sourceAnchor)
            XCTAssertEqual(try library.notes(articleId: localB).first?.id, note.id)
        }
    }

    func testNoteMoveDuringPullReparentsPendingEditWithoutRollingBackPage() async throws {
        for newParentFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: "page")
            var moved = note; moved.articleId = articleB.id
            let old = page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0]
            let new = page(articleB, notes: [moved]).changes[0]
            let api = AnnotationFixtureAPI()
            api.onPull = { _ in
                try library.updateNote(id: note.id, content: "Typed during pull")
                return NativeLibraryPage(protocolVersion: 2, changes: newParentFirst ? [new, old] : [old, new], cursor: "move-with-edit", hasMore: false)
            }
            try await library.sync(session: session(), client: api)
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(try library.syncCursor(), "move-with-edit")
            XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
            XCTAssertEqual(try library.notes(articleId: localB).first?.content, "Typed during pull")
            let dispatched = api.pushes.flatMap { $0 }
            XCTAssertEqual(dispatched.count, 1)
            let assignment = try XCTUnwrap(dispatched.first)
            XCTAssertEqual(assignment.articleId, articleB.id)
            XCTAssertEqual(assignment.kind, "note.update")
            XCTAssertEqual(assignment.patch?.content, "Typed during pull")
            XCTAssertEqual(try library.syncState().pendingCount, 0)
            XCTAssertTrue(try library.prepareBatch().isEmpty)
            let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
            XCTAssertTrue(backup.annotationRecovery?.contains { $0.payload.contains("Typed during pull") } == true)
        }
    }

    func testOldParentDeletedReceiptCannotHideMovedNoteOrClearRebasedEdit() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let note = webNote(article: articleA)
        try library.apply(page(articleA, notes: [note]), after: "page")
        try library.updateNote(id: note.id, content: "Frozen local edit")
        let oldBatch = try library.prepareBatch()
        let frozenPayload = oldBatch[0].mutation
        var moved = note; moved.articleId = articleB.id
        try library.apply(page(articleB, notes: [moved]), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        XCTAssertEqual(try library.notes(articleId: localB).first?.content, "Frozen local edit")
        let retry = try library.database.read { try library.pending(in: $0, id: localA) }
        XCTAssertEqual(retry.first?.mutation, frozenPayload)
        try library.acknowledge(AnnotationFixtureAPI.ack(oldBatch.map(\.mutation), status: "deleted"), batch: oldBatch)
        XCTAssertEqual(try library.notes(articleId: localB).first?.content, "Frozen local edit")
        let pending = try library.prepareBatch()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].localID, localB)
        XCTAssertEqual(pending[0].mutation.articleId, articleB.id)
        XCTAssertEqual(pending[0].mutation.patch?.content, "Frozen local edit")
        XCTAssertNotEqual(pending[0].mutation.mutationId, frozenPayload.mutationId)
        XCTAssertEqual(try library.articles().count, 2)
    }

    func testStaleOldParentDeleteACKDoesNotHideNoteMovedToNewParent() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let note = webNote(article: articleA)
        try library.apply(page(articleA, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let oldBatch = try library.prepareBatch()
        var moved = note; moved.articleId = articleB.id
        try library.apply(page(articleB, notes: [moved]), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        try library.acknowledge(AnnotationFixtureAPI.ack(oldBatch.map(\.mutation)), batch: oldBatch)
        XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
        XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testNullNoteInputIsRejectedBeforeVisibleEditOutboxOrRecoveryCommit() throws {
        let (library, _, localID) = try fixture()
        let note = try library.createNote(articleId: localID, content: "Visible original")
        let before = try library.exportJSON()
        for attempt in [
            { _ = try library.createNote(articleId: localID, content: "new\0note") },
            { try library.updateNote(id: note.id, content: "bad\0edit") },
            { try library.saveNote(id: localID, text: "bad\0legacy-edit") }
        ] {
            XCTAssertThrowsError(try attempt()) { XCTAssertEqual($0 as? NativeAnnotationError, .invalidNoteContent) }
            XCTAssertEqual(try library.exportJSON(), before)
            XCTAssertEqual(try library.syncState().pendingCount, 1)
            XCTAssertEqual(try library.notes(articleId: localID).first?.content, "Visible original")
        }
    }

    func testNativeSourceContextsAreBoundedAndInvalidSelectorsNeverCommit() throws {
        let library = try Library()
        let article = try library.saveURL("https://example.com/context")
        let hugeGrapheme = "a" + String(repeating: "\u{301}", count: 2050)
        let content = hugeGrapheme + " quote"
        try library.saveContent(id: article.id, title: "Context", text: content)
        let highlight = try library.addHighlight(articleId: article.id, content: content, range: (content as NSString).range(of: "quote"))
        XCTAssertLessThanOrEqual(try XCTUnwrap(highlight.sourceAnchor).contextPrefix.utf16.count, 2048)
        XCTAssertTrue(try XCTUnwrap(highlight.sourceAnchor).isValid)
        try library.saveContent(id: article.id, title: "Context", text: "bad\0 quote")
        XCTAssertThrowsError(try library.addHighlight(articleId: article.id, content: "bad\0 quote", range: NSRange(location: 5, length: 5)))
        XCTAssertEqual(try library.highlights(articleId: article.id).count, 1)
        var source = try XCTUnwrap(highlight.sourceAnchor)
        source.contextSuffix = String(repeating: "x", count: 2049)
        XCTAssertFalse(source.isValid)
        source.contextSuffix = "bad\0context"
        XCTAssertFalse(source.isValid)
        source.contextSuffix = ""
        source.startOffset = 2_147_483_647
        source.endOffset = 2_147_483_652
        XCTAssertFalse(source.isValid)
    }

    func testRoundTripRelationshipMoveReturnsLiveNoteAndHighlightInEveryPageOrder() throws {
        for newParentFirst in [true, false] {
            for returnParentFirst in [true, false] {
                let (library, articleA, localA) = try fixture()
                let articleB = remote(text: articleA.text)
                let highlight = wireHighlight(article: articleA)
                let note = webNote(article: articleA, highlightID: highlight.id)
                try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: "page")
                var highlightB = highlight; highlightB.articleId = articleB.id
                var noteB = note; noteB.articleId = articleB.id
                let deleted = [NativeAnnotationDeletion(kind: "highlight", id: highlight.id), NativeAnnotationDeletion(kind: "note", id: note.id)]
                let oldA = atRevision(page(articleA, deleted: deleted).changes[0], "2")
                let newB = atRevision(page(articleB, notes: [noteB], highlights: [highlightB]).changes[0], "3")
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: newParentFirst ? [newB, oldA] : [oldA, newB], cursor: "outward", hasMore: false), after: "page")
                let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
                XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
                let oldB = atRevision(page(articleB, deleted: deleted).changes[0], "4")
                let returnA = atRevision(page(articleA, notes: [note], highlights: [highlight]).changes[0], "5")
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: returnParentFirst ? [returnA, oldB] : [oldB, returnA], cursor: "returned", hasMore: false), after: "outward")
                XCTAssertEqual(try library.notes(articleId: localA).map(\.id), [note.id])
                XCTAssertEqual(try library.highlights(articleId: localA).map(\.id), [highlight.id])
                XCTAssertEqual(try library.highlights(articleId: localA).first?.sourceAnchor, highlight.sourceAnchor)
                XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
                XCTAssertTrue(try library.highlights(articleId: localB).isEmpty)
                // Delayed relationship-invalidating snapshots cannot undo the newer return.
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [oldA], cursor: "stale-old-parent", hasMore: false), after: "returned")
                XCTAssertEqual(try library.notes(articleId: localA).count, 1)
                XCTAssertEqual(try library.highlights(articleId: localA).count, 1)
            }
        }
    }

    func testOldParentUnrelatedRevisionDoesNotSuppressLiveDifferentParent() throws {
        for newParentFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: "page")
            var moved = note; moved.articleId = articleB.id
            // The old parent's later unrelated edits carry its historical child tombstones.
            let old = atRevision(page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "99")
            let new = atRevision(page(articleB, notes: [moved]).changes[0], "3")
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: newParentFirst ? [new, old] : [old, new], cursor: "independent-parents", hasMore: false), after: "page")
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
        }
    }

    func testReturningLiveSnapshotRetainsPendingDeleteOverlayUntilStaleACKClearsIt() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let note = webNote(article: articleA)
        try library.apply(page(articleA, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let frozenDelete = try library.prepareBatch()
        XCTAssertEqual(frozenDelete[0].annotationRevision, "1")
        var noteB = note; noteB.articleId = articleB.id
        let oldA = atRevision(page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "2")
        let newB = atRevision(page(articleB, notes: [noteB]).changes[0], "3")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [newB, oldA], cursor: "outward", hasMore: false), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        XCTAssertEqual(try library.notes(articleId: localB).count, 1)
        let oldB = atRevision(page(articleB, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "4")
        let returnA = atRevision(page(articleA, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returnA, oldB], cursor: "returned", hasMore: false), after: "outward")
        XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
        XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
        try library.acknowledge(AnnotationFixtureAPI.ack(frozenDelete.map(\.mutation)), batch: frozenDelete)
        XCTAssertEqual(try library.notes(articleId: localA).map(\.id), [note.id])
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertEqual(try library.syncCursor(), "returned")
    }

    func testPhysicalDeletionRejectsStaleLiveSnapshotAndOfflineCreate() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        let deleted = atRevision(page(article, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "2")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [deleted], cursor: "physically-deleted", hasMore: false), after: "page")
        try library.apply(page(article, notes: [note], cursor: "stale-live"), after: "physically-deleted")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        try library.database.write { db in
            try library.enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.create", articleId: article.id, noteId: note.id, content: "Stale offline create"), localID: localID, in: db)
        }
        XCTAssertTrue(try library.prepareBatch().isEmpty)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
        XCTAssertTrue(backup.annotationRecovery?.contains { $0.annotationID == note.id } == true)
    }

    func testCurrentRelationshipDeleteACKStillHidesAfterUnrelatedParentRevision() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let frozenDelete = try library.prepareBatch()
        let updatedParent = atRevision(page(article, notes: [note]).changes[0], "2")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [updatedParent], cursor: "unrelated-parent-edit", hasMore: false), after: "page")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        try library.acknowledge(AnnotationFixtureAPI.ack(frozenDelete.map(\.mutation)), batch: frozenDelete)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testVersionFiveUpgradePreservesFrozenOutboxAndCursorWithParentContext() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-v5-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("fixture.sqlite").path
        let library = try Library(path: path)
        try library.enableAnnotationSync(session: session())
        let article = remote()
        try library.apply(page(article), after: nil)
        let localID = try XCTUnwrap(library.articles().first?.id)
        let note = try library.createNote(articleId: localID, content: "Durable v5 note")
        let original = try library.prepareBatch()[0].mutation
        // Recreate the earlier v5 table shape without changing its actual records or payloads.
        try library.database.write { db in
            try db.execute(sql: """
                CREATE TABLE native_annotation_state_v5 (
                    kind TEXT NOT NULL, id TEXT NOT NULL, articleId TEXT NOT NULL,
                    deleted BOOLEAN NOT NULL DEFAULT 0, present BOOLEAN NOT NULL DEFAULT 1,
                    PRIMARY KEY(kind, id)
                );
                INSERT INTO native_annotation_state_v5 SELECT kind, id, articleId, deleted, present FROM native_annotation_state;
                DROP TABLE native_annotation_state;
                ALTER TABLE native_annotation_state_v5 RENAME TO native_annotation_state;
                CREATE INDEX native_annotation_article ON native_annotation_state(articleId);
                ALTER TABLE native_pending DROP COLUMN annotationRevision;
                ALTER TABLE native_pending DROP COLUMN annotationGeneration;
                DROP TABLE native_annotation_permanent;
                DROP TABLE native_annotation_deferred;
                DROP TABLE native_annotation_parent;
                DELETE FROM grdb_migrations WHERE identifier IN ('v6-annotation-parent-context', 'v7-permanent-annotation-identities', 'v8-annotation-deferred-and-aliases');
                """)
        }
        let reopened = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try reopened.syncCursor(), "page")
        XCTAssertEqual(try reopened.notes(articleId: localID).map(\.id), [note.id])
        let batch = try reopened.prepareBatch()
        XCTAssertEqual(batch.first?.mutation, original)
        XCTAssertTrue(batch[0].frozen)
        XCTAssertEqual(try reopened.syncState().pendingCount, 1)
        try reopened.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation)), batch: batch)
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
    }

    func testEffectRevisionFencesUnobservedRoundTripBeforeDelayedDeletedACK() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let batch = try library.prepareBatch()
        // Server A -> B -> A is not observed: only its final current A snapshot arrives.
        let returned = atRevision(page(article, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returned], cursor: "returned-unobserved", hasMore: false), after: "page")
        let state = try library.database.read { try NativeAnnotationState.fetchOne($0, sql: "SELECT * FROM native_annotation_state WHERE kind = 'note' AND id = ? AND articleId = ?", arguments: [note.id, localID]) }
        XCTAssertEqual(state?.generation, 0)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty) // Pending delete still overlays.
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "2"), batch: batch)
        XCTAssertEqual(try library.notes(articleId: localID).map(\.id), [note.id])
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertEqual(try library.syncCursor(), "returned-unobserved")
        XCTAssertEqual(try library.articles().count, 1)
    }

    func testNewerLiveSnapshotIsAcceptedAfterOlderDeletedEffectACK() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let batch = try library.prepareBatch()
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "2"), batch: batch)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertEqual(try library.syncCursor(), "page")
        let returned = atRevision(page(article, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returned], cursor: "newer-live", hasMore: false), after: "page")
        XCTAssertEqual(try library.notes(articleId: localID).map(\.id), [note.id])
    }

    func testPhysicalDeleteEffectCannotBeResurrectedByStaleLiveSnapshot() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.deleteNote(id: note.id)
        let batch = try library.prepareBatch()
        let live = atRevision(page(article, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [live], cursor: "live-five", hasMore: false), after: "page")
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6"), batch: batch)
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertEqual(try library.syncCursor(), "live-five")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [live], cursor: "stale-five", hasMore: false), after: "live-five")
        XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        let state = try library.database.read { try NativeAnnotationState.fetchOne($0, sql: "SELECT * FROM native_annotation_state WHERE kind = 'note' AND id = ? AND articleId = ?", arguments: [note.id, localID]) }
        XCTAssertEqual(state?.revision, "6")
        XCTAssertEqual(state?.serverLive, false)
    }

    func testHighlightEffectFencesUnobservedMoveAndCorrectlyRestoresOrDeletesAttachedNote() throws {
        for effectRevision in ["2", "6"] {
            let (library, article, localID) = try fixture()
            let highlight = wireHighlight(article: article)
            let note = webNote(article: article, highlightID: highlight.id)
            try library.apply(page(article, notes: [note], highlights: [highlight]), after: "page")
            try library.deleteHighlight(id: highlight.id)
            let batch = try library.prepareBatch()
            let returned = atRevision(page(article, notes: [note], highlights: [highlight]).changes[0], "5")
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returned], cursor: "returned-highlight", hasMore: false), after: "page")
            XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
            try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: effectRevision), batch: batch)
            if effectRevision == "2" {
                XCTAssertEqual(try library.highlights(articleId: localID).map(\.id), [highlight.id])
                XCTAssertEqual(try library.notes(articleId: localID).map(\.id), [note.id])
                XCTAssertEqual(try library.highlights(articleId: localID).first?.sourceAnchor, highlight.sourceAnchor)
            } else {
                XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
                XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returned], cursor: "stale-highlight", hasMore: false), after: "returned-highlight")
                XCTAssertTrue(try library.highlights(articleId: localID).isEmpty)
                XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
            }
            XCTAssertEqual(try library.articles().count, 1)
        }
    }

    func testStaleDeletedAssignmentReceiptRebasesUnobservedMoveWithNewIdentity() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.updateNote(id: note.id, content: "Preserved pending edit")
        let frozen = try library.prepareBatch()
        let requestBytes = try NativeLibraryWire.encoder().encode(frozen[0].mutation)
        let returned = atRevision(page(article, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [returned], cursor: "unobserved-return", hasMore: false), after: "page")
        try library.acknowledge(AnnotationFixtureAPI.ack(frozen.map(\.mutation), status: "deleted", effectRevision: "2"), batch: frozen)
        let rebased = try library.prepareBatch()
        XCTAssertEqual(rebased.count, 1)
        XCTAssertNotEqual(rebased[0].mutation.mutationId, frozen[0].mutation.mutationId)
        XCTAssertEqual(rebased[0].mutation.kind, "note.update")
        XCTAssertEqual(rebased[0].mutation.articleId, article.id)
        XCTAssertEqual(rebased[0].mutation.patch?.content, "Preserved pending edit")
        XCTAssertEqual(try library.notes(articleId: localID).first?.content, "Preserved pending edit")
        XCTAssertEqual(try NativeLibraryWire.encoder().encode(frozen[0].mutation), requestBytes)
        XCTAssertEqual(try library.syncCursor(), "unobserved-return")
    }

    func testAppliedEffectWatermarkPreservesAcknowledgedEditAgainstOlderPull() throws {
        let (library, article, localID) = try fixture()
        let note = webNote(article: article)
        try library.apply(page(article, notes: [note]), after: "page")
        try library.updateNote(id: note.id, content: "Committed edit")
        let batch = try library.prepareBatch()
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "7"), batch: batch)
        XCTAssertEqual(try library.syncCursor(), "page")
        let stale = atRevision(page(article, notes: [note]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [stale], cursor: "older-pull", hasMore: false), after: "page")
        XCTAssertEqual(try library.notes(articleId: localID).first?.content, "Committed edit")
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testLostResponseRetriesFrozenRequestAndOriginalEffectAcrossRestart() async throws {
        for effectRevision in ["2", "6"] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-effect-" + UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }
            let path = directory.appendingPathComponent("fixture.sqlite").path
            let library = try Library(path: path)
            try library.enableAnnotationSync(session: session())
            let article = remote()
            let note = webNote(article: article)
            try library.apply(page(article, notes: [note]), after: nil)
            let localID = try XCTUnwrap(library.articles().first?.id)
            try library.deleteNote(id: note.id)
            let api = AnnotationFixtureAPI()
            var receipt: NativeLibraryAcknowledgment?
            api.onPush = { mutations in
                if let receipt { return receipt }
                receipt = AnnotationFixtureAPI.ack(mutations, effectRevision: effectRevision)
                throw NativeLibraryError.unavailable
            }
            do { try await library.sync(session: session(), client: api); XCTFail("Expected lost response") }
            catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
            let bytes = try NativeLibraryWire.encoder().encode(try XCTUnwrap(api.pushes.first?.first))
            let reopened = try Library(path: path, syncEnabled: true)
            let live = atRevision(page(article, notes: [note]).changes[0], "5")
            api.onPull = { _ in NativeLibraryPage(protocolVersion: 2, changes: [live], cursor: "live-five", hasMore: false) }
            try await reopened.sync(session: session(), client: api)
            XCTAssertEqual(api.pushes.count, 2)
            XCTAssertEqual(try NativeLibraryWire.encoder().encode(api.pushes[1][0]), bytes)
            XCTAssertEqual(receipt?.results.first?.effectRevision, effectRevision)
            XCTAssertEqual(try reopened.notes(articleId: localID).count, effectRevision == "2" ? 1 : 0)
            XCTAssertEqual(try reopened.syncState().pendingCount, 0)
            XCTAssertEqual(try reopened.syncCursor(), "live-five")
        }
    }

    func testMalformedEffectRevisionCannotPartiallyAcknowledgeOrAdvanceCursor() throws {
        for effect in ["", "-1", "+1", "1.0", "1e3", " 1", "١", String(repeating: "1", count: 129)] {
            let (library, article, localID) = try fixture()
            let note = webNote(article: article)
            try library.apply(page(article, notes: [note]), after: "page")
            try library.deleteNote(id: note.id)
            let batch = try library.prepareBatch()
            XCTAssertThrowsError(try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: effect), batch: batch)) {
                XCTAssertEqual($0 as? NativeLibraryError, .invalidResponse)
            }
            XCTAssertEqual(try library.syncState().pendingCount, 1)
            XCTAssertEqual(try library.prepareBatch().first?.mutation, batch[0].mutation)
            XCTAssertEqual(try library.syncCursor(), "page")
            XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        }
    }

    func testReversedReceiptOrderDoesNotRequeueAnAlreadyRebasedAssignment() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let note = webNote(article: articleA)
        try library.apply(page(articleA, notes: [note]), after: "page")
        try library.updateNote(id: note.id, content: "Pending assignment")
        _ = try library.prepareBatch() // Freeze the old-parent request before its response is lost.
        var moved = note; moved.articleId = articleB.id
        let current = atRevision(page(articleB, notes: [moved]).changes[0], "3")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [current], cursor: "moved", hasMore: false), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        let batch = try library.prepareBatch()
        XCTAssertEqual(batch.count, 2)
        let results = batch.map { item in
            NativeLibraryMutationResult(mutationId: item.mutation.mutationId, status: item.localID == localA ? "deleted" : "applied",
                articleId: item.mutation.articleId, annotationId: note.id, effectRevision: item.localID == localA ? "2" : "4")
        }
        try library.acknowledge(NativeLibraryAcknowledgment(protocolVersion: 2, results: Array(results.reversed())), batch: batch)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
        XCTAssertEqual(try library.notes(articleId: localB).first?.content, "Pending assignment")
        XCTAssertEqual(try library.syncCursor(), "moved")
    }

    func testPermanentDeletionFencesOtherParentSnapshotInEitherACKOrder() throws {
        for snapshotFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: "page")
            try library.deleteNote(id: note.id)
            let batch = try library.prepareBatch()
            var moved = note; moved.articleId = articleB.id
            let oldB = atRevision(page(articleB, notes: [moved]).changes[0], "3")
            if snapshotFirst {
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [oldB], cursor: "in-flight-B", hasMore: false), after: "page")
            }
            let cursor = try library.syncCursor()
            try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6", permanentDeletion: true), batch: batch)
            XCTAssertEqual(try library.syncCursor(), cursor)
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [oldB], cursor: "old-B-after-ACK", hasMore: false), after: cursor)
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
            XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
            // Physical identities cannot be reused, even under a later parent revision.
            let impossibleReuse = atRevision(oldB, "99")
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [impossibleReuse], cursor: "no-id-reuse", hasMore: false), after: "old-B-after-ACK")
            XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
            let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
            XCTAssertEqual(backup.permanentAnnotationDeletions?.first?.id, note.id)
            XCTAssertEqual(backup.permanentAnnotationDeletions?.first?.revision, "6")
            XCTAssertTrue(backup.annotationRecovery?.contains { $0.annotationID == note.id } == true)
            XCTAssertEqual(try library.syncState().pendingCount, 0)
            XCTAssertEqual(try library.articles().count, 2)
        }
    }

    func testOldParentMissDoesNotFenceValidOtherParentInEitherACKOrder() throws {
        for snapshotFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: "page")
            try library.deleteNote(id: note.id)
            let batch = try library.prepareBatch()
            var moved = note; moved.articleId = articleB.id
            let liveB = atRevision(page(articleB, notes: [moved]).changes[0], "3")
            if snapshotFirst { try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [liveB], cursor: "live-B", hasMore: false), after: "page") }
            let cursor = try library.syncCursor()
            try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6", permanentDeletion: false), batch: batch)
            XCTAssertEqual(try library.syncCursor(), cursor)
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [liveB], cursor: "valid-B", hasMore: false), after: cursor)
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
            XCTAssertTrue(try library.notes(articleId: localA).isEmpty)
            let backup = try NativeLibraryWire.decoder().decode(LibraryBackup.self, from: library.exportJSON())
            XCTAssertTrue(backup.permanentAnnotationDeletions?.isEmpty == true)
            XCTAssertEqual(try library.syncState().pendingCount, 0)
        }
    }

    func testLostACKRepeatsExactPermanentFlagAndEffectAcrossRestart() async throws {
        for permanentDeletion in [true, false] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-permanent-" + UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }
            let path = directory.appendingPathComponent("fixture.sqlite").path
            let library = try Library(path: path)
            try library.enableAnnotationSync(session: session())
            let articleA = remote()
            let articleB = remote()
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note]), after: nil)
            let localA = try XCTUnwrap(library.articles().first?.id)
            try library.deleteNote(id: note.id)
            let api = AnnotationFixtureAPI()
            var receipt: NativeLibraryAcknowledgment?
            api.onPush = { mutations in
                if let receipt { return receipt }
                receipt = AnnotationFixtureAPI.ack(mutations, effectRevision: "6", permanentDeletion: permanentDeletion)
                throw NativeLibraryError.unavailable
            }
            do { try await library.sync(session: session(), client: api); XCTFail("Expected lost ACK") }
            catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
            let payload = try NativeLibraryWire.encoder().encode(try XCTUnwrap(api.pushes.first?.first))
            let reopened = try Library(path: path, syncEnabled: true)
            var moved = note; moved.articleId = articleB.id
            let liveB = atRevision(page(articleB, notes: [moved]).changes[0], "3")
            api.onPull = { cursor in
                XCTAssertEqual(cursor, "page") // Neither receipt metadata nor its effect advances the pull cursor.
                return NativeLibraryPage(protocolVersion: 2, changes: [liveB], cursor: "B-after-retry", hasMore: false)
            }
            try await reopened.sync(session: session(), client: api)
            XCTAssertEqual(api.pushes.count, 2)
            XCTAssertEqual(try NativeLibraryWire.encoder().encode(api.pushes[1][0]), payload)
            XCTAssertEqual(receipt?.results.first?.permanentDeletion, permanentDeletion)
            XCTAssertEqual(receipt?.results.first?.effectRevision, "6")
            let localB = try XCTUnwrap(reopened.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(try reopened.notes(articleId: localB).count, permanentDeletion ? 0 : 1)
            let again = try Library(path: path, syncEnabled: true)
            try again.apply(NativeLibraryPage(protocolVersion: 2, changes: [liveB], cursor: "B-after-second-restart", hasMore: false), after: "B-after-retry")
            XCTAssertEqual(try again.notes(articleId: localB).count, permanentDeletion ? 0 : 1)
            XCTAssertEqual(try again.syncState().pendingCount, 0)
        }
    }

    func testUnknownIdentityConfirmedAbsentCannotBeCreatedByLaterStaleSnapshot() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let id = UUID().uuidString.lowercased()
        try library.database.write { db in
            try library.enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.delete", articleId: articleA.id, noteId: id), localID: localA, in: db)
        }
        let batch = try library.prepareBatch()
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6", permanentDeletion: true), batch: batch)
        XCTAssertEqual(try library.syncCursor(), "page")
        let unknown = webNote(article: articleB, id: id)
        let stale = atRevision(page(articleB, notes: [unknown]).changes[0], "3")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [stale], cursor: "unknown-stale", hasMore: false), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
        XCTAssertTrue(try library.database.read { try library.annotationPermanentlyDeleted(kind: "note", id: id.uppercased(), in: $0) })
    }

    func testPermanentHighlightDeletionHidesStaleAttachmentWithoutDeletingDetachedNoteIdentity() throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote(text: articleA.text)
        let highlight = wireHighlight(article: articleA)
        let note = webNote(article: articleA, highlightID: highlight.id)
        try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: "page")
        try library.deleteHighlight(id: highlight.id)
        let batch = try library.prepareBatch()
        var movedHighlight = highlight; movedHighlight.articleId = articleB.id
        var movedNote = note; movedNote.articleId = articleB.id
        let moved = atRevision(page(articleB, notes: [movedNote], highlights: [movedHighlight]).changes[0], "3")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [moved], cursor: "moved-highlight", hasMore: false), after: "page")
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6", permanentDeletion: true), batch: batch)
        XCTAssertTrue(try library.highlights(articleId: localB).isEmpty)
        XCTAssertTrue(try library.notes(articleId: localB).isEmpty)
        movedNote.highlightId = nil // This detach happened before the physical highlight delete.
        let detached = atRevision(page(articleB, notes: [movedNote]).changes[0], "5")
        try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [detached], cursor: "detached-note", hasMore: false), after: "moved-highlight")
        XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
        XCTAssertFalse(try library.database.read { try library.annotationPermanentlyDeleted(kind: "note", id: note.id, in: $0) })
        XCTAssertTrue(try library.database.read { try library.annotationPermanentlyDeleted(kind: "highlight", id: highlight.id, in: $0) })
    }

    func testPermanentFlagOnAppliedResultCannotAcknowledgePendingWork() throws {
        let (library, _, localID) = try fixture()
        _ = try library.createNote(articleId: localID, content: "Original")
        let batch = try library.prepareBatch()
        XCTAssertThrowsError(try library.acknowledge(AnnotationFixtureAPI.ack(batch.map(\.mutation), effectRevision: "6", permanentDeletion: true), batch: batch)) {
            XCTAssertEqual($0 as? NativeLibraryError, .invalidResponse)
        }
        XCTAssertEqual(try library.syncState().pendingCount, 1)
        XCTAssertEqual(try library.syncCursor(), "page")
    }

    func testRemoteDeletionWhileEditingThrowsWithoutClosingOrLosingDraft() throws {
        for parentDeleted in [false, true] {
            let (library, article, localID) = try fixture()
            let note = webNote(article: article, content: "Persisted original")
            try library.apply(page(article, notes: [note]), after: "page")
            let draft = "Unsaved editor draft"
            if parentDeleted {
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [NativeLibraryChange(revision: "2", id: article.id, deleted: true, article: nil)], cursor: "parent-deleted", hasMore: false), after: "page")
            } else {
                let deleted = atRevision(page(article, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "2")
                try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [deleted], cursor: "note-deleted", hasMore: false), after: "page")
            }
            let before = try library.exportJSON()
            let pending = try library.syncState().pendingCount
            XCTAssertThrowsError(try library.updateNote(id: note.id, content: draft)) {
                XCTAssertEqual($0 as? NativeAnnotationError, .noteUnavailable)
            }
            XCTAssertEqual(draft, "Unsaved editor draft")
            XCTAssertEqual(try library.exportJSON(), before)
            XCTAssertEqual(try library.syncState().pendingCount, pending)
            XCTAssertTrue(try library.notes(articleId: localID).isEmpty)
        }
        let library = try Library()
        let before = try library.exportJSON()
        XCTAssertThrowsError(try library.updateNote(id: UUID().uuidString.lowercased(), content: "Draft for missing note")) {
            XCTAssertEqual($0 as? NativeAnnotationError, .noteUnavailable)
        }
        XCTAssertEqual(try library.exportJSON(), before)
    }

    func testPushFirstOldParentMissDefersTextAndColorUntilLiveParentIsPulled() async throws {
        for oldParentFirst in [true, false] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote(text: articleA.text)
            let highlight = wireHighlight(article: articleA)
            let note = webNote(article: articleA, highlightID: highlight.id)
            try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: "page")
            try library.updateNote(id: note.id, content: "Offline text survives the move")
            try library.setHighlightColor(id: highlight.id, color: .orange)
            var movedNote = note; movedNote.articleId = articleB.id
            var movedHighlight = highlight; movedHighlight.articleId = articleB.id
            var serverText = note.content
            var serverColor = highlight.color
            let api = AnnotationFixtureAPI()
            api.onPush = { mutations in
                XCTAssertEqual(mutations.count, 1)
                let mutation = try XCTUnwrap(mutations.first)
                if mutation.articleId == articleA.id {
                    return AnnotationFixtureAPI.ack(mutations, status: "deleted", effectRevision: "6", permanentDeletion: false)
                }
                XCTAssertEqual(mutation.articleId, articleB.id)
                if let content = mutation.patch?.content { serverText = content }
                if let color = mutation.patch?.color { serverColor = color }
                return AnnotationFixtureAPI.ack(mutations, effectRevision: "7")
            }
            api.onPull = { _ in
                XCTAssertEqual(api.pushes.flatMap { $0 }.filter { $0.articleId == articleA.id }.count, 2)
                let old = self.atRevision(self.page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id), NativeAnnotationDeletion(kind: "highlight", id: highlight.id)]).changes[0], "6")
                let new = self.atRevision(self.page(articleB, notes: [movedNote], highlights: [movedHighlight]).changes[0], "3")
                return NativeLibraryPage(protocolVersion: 2, changes: oldParentFirst ? [old, new] : [new, old], cursor: "move-discovered", hasMore: false)
            }
            try await library.sync(session: session(), client: api)
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(serverText, "Offline text survives the move")
            XCTAssertEqual(serverColor, .orange)
            XCTAssertEqual(try library.notes(articleId: localB).first?.content, serverText)
            XCTAssertEqual(try library.highlights(articleId: localB).first?.color, serverColor)
            let sent = api.pushes.flatMap { $0 }
            for kind in ["note.update", "highlight.update"] {
                let original = try XCTUnwrap(sent.first { $0.kind == kind && $0.articleId == articleA.id })
                let replacement = try XCTUnwrap(sent.first { $0.kind == kind && $0.articleId == articleB.id })
                XCTAssertNotEqual(original.mutationId, replacement.mutationId)
                XCTAssertEqual(original.patch, replacement.patch)
            }
            XCTAssertEqual(sent.count, 4)
            XCTAssertEqual(try library.syncState().pendingCount, 0)
            XCTAssertEqual(try library.syncCursor(), "move-discovered")
        }
    }

    func testDeferredMoveAssignmentsSurviveRestartWithoutRetryingRetiredParent() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-deferred-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("fixture.sqlite").path
        let library = try Library(path: path)
        try library.enableAnnotationSync(session: session())
        let articleA = remote()
        let articleB = remote(text: articleA.text)
        let highlight = wireHighlight(article: articleA)
        let note = webNote(article: articleA, highlightID: highlight.id)
        try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: nil)
        let localA = try XCTUnwrap(library.articles().first?.id)
        try library.updateNote(id: note.id, content: "Durable deferred text")
        try library.setHighlightColor(id: highlight.id, color: .gray)
        let api = AnnotationFixtureAPI()
        var serverText = note.content
        var serverColor = highlight.color
        api.onPush = { mutations in
            let mutation = try XCTUnwrap(mutations.first)
            if mutation.articleId == articleA.id { return AnnotationFixtureAPI.ack(mutations, status: "deleted", effectRevision: "6", permanentDeletion: false) }
            XCTAssertEqual(mutation.articleId, articleB.id)
            if let content = mutation.patch?.content { serverText = content }
            if let color = mutation.patch?.color { serverColor = color }
            return AnnotationFixtureAPI.ack(mutations, effectRevision: "7")
        }
        api.onPull = { _ in throw NativeLibraryError.unavailable }
        do { try await library.sync(session: session(), client: api); XCTFail("Expected unavailable pull") }
        catch { XCTAssertEqual(error as? NativeLibraryError, .unavailable) }
        XCTAssertEqual(api.pushes.count, 2)
        XCTAssertTrue(try library.prepareBatch().isEmpty)
        XCTAssertEqual(try library.syncState().pendingCount, 2)
        let deferred = try storedDeferred(library)
        XCTAssertEqual(deferred.count, 2)
        let freshIDs = Set(deferred.map { $0.mutation.mutationId })
        XCTAssertTrue(freshIDs.isDisjoint(with: Set(api.pushes.flatMap { $0 }.map(\.mutationId))))
        let reopened = try Library(path: path, syncEnabled: true)
        var movedNote = note; movedNote.articleId = articleB.id
        var movedHighlight = highlight; movedHighlight.articleId = articleB.id
        api.onPull = { cursor in
            XCTAssertEqual(cursor, "page")
            return NativeLibraryPage(protocolVersion: 2, changes: [self.atRevision(self.page(articleB, notes: [movedNote], highlights: [movedHighlight]).changes[0], "3")], cursor: "live-target", hasMore: false)
        }
        try await reopened.sync(session: session(), client: api)
        XCTAssertEqual(api.pushes.count, 4)
        let routed = api.pushes.flatMap { $0 }.filter { $0.articleId == articleB.id }
        XCTAssertEqual(Set(routed.map(\.mutationId)), freshIDs)
        XCTAssertEqual(serverText, "Durable deferred text")
        XCTAssertEqual(serverColor, .gray)
        let localB = try XCTUnwrap(reopened.articles().first { $0.id != localA }?.id)
        XCTAssertEqual(try reopened.notes(articleId: localB).first?.content, serverText)
        XCTAssertEqual(try reopened.highlights(articleId: localB).first?.color, serverColor)
        XCTAssertEqual(try reopened.syncState().pendingCount, 0)
    }

    func testNewerEditQueuedDuringOldParentACKReplacesDeferredAssignment() async throws {
        let (library, articleA, localA) = try fixture()
        let articleB = remote()
        let note = webNote(article: articleA)
        try library.apply(page(articleA, notes: [note]), after: "page")
        try library.updateNote(id: note.id, content: "Older offline edit")
        let api = AnnotationFixtureAPI()
        var serverText = note.content
        api.onPush = { mutations in
            let mutation = try XCTUnwrap(mutations.first)
            if mutation.articleId == articleA.id {
                try library.updateNote(id: note.id, content: "Newer edit while awaiting ACK")
                return AnnotationFixtureAPI.ack(mutations, status: "deleted", effectRevision: "6", permanentDeletion: false)
            }
            serverText = try XCTUnwrap(mutation.patch?.content)
            return AnnotationFixtureAPI.ack(mutations, effectRevision: "7")
        }
        var moved = note; moved.articleId = articleB.id
        api.onPull = { _ in NativeLibraryPage(protocolVersion: 2, changes: [self.atRevision(self.page(articleB, notes: [moved]).changes[0], "3")], cursor: "new-parent", hasMore: false) }
        try await library.sync(session: session(), client: api)
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
        XCTAssertEqual(serverText, "Newer edit while awaiting ACK")
        XCTAssertEqual(try library.notes(articleId: localB).first?.content, serverText)
        XCTAssertEqual(api.pushes.flatMap { $0 }.filter { $0.articleId == articleA.id }.count, 1)
        XCTAssertEqual(try library.syncState().pendingCount, 0)
    }

    func testLargeIncomingNotesUseReadBudgetAndDoNotPinFollowingChangesOrDeletes() async throws {
        for content in [String(repeating: "a", count: 200_001), String(repeating: "/", count: 600_000)] {
            let library = try Library()
            try library.enableAnnotationSync(session: session())
            let articleA = remote()
            let articleB = remote()
            let note = webNote(article: articleA, content: content)
            let change = page(articleA, notes: [note]).changes[0]
            XCTAssertLessThan(try NativeLibraryWire.responseEncoder().encode(change).count, NativeLibraryWire.maxRequestBytes)
            if content.first == "/" { XCTAssertGreaterThan(try NativeLibraryWire.encoder().encode(change).count, NativeLibraryWire.maxRequestBytes) }
            let api = AnnotationFixtureAPI()
            api.onPull = { cursor in
                if cursor == nil {
                    return NativeLibraryPage(protocolVersion: 2, changes: [change, self.atRevision(self.page(articleB).changes[0], "2")], cursor: "large-and-following", hasMore: true)
                }
                XCTAssertEqual(cursor, "large-and-following")
                let localA = try await library.database.read { try XCTUnwrap(String.fetchOne($0, sql: "SELECT localID FROM native_mapping WHERE serverID = ?", arguments: [articleA.id])) }
                XCTAssertEqual(try library.notes(articleId: localA).first?.content, content)
                XCTAssertEqual(try library.articles().count, 2)
                let deleted = self.atRevision(self.page(articleA, deleted: [NativeAnnotationDeletion(kind: "note", id: note.id)]).changes[0], "3")
                return NativeLibraryPage(protocolVersion: 2, changes: [deleted], cursor: "after-large-delete", hasMore: false)
            }
            try await library.sync(session: session(), client: api)
            XCTAssertEqual(try library.syncCursor(), "after-large-delete")
            XCTAssertEqual(try library.articles().count, 2)
            let retained = try await library.database.read { try XCTUnwrap(LibraryNote.fetchOne($0, key: note.id)) }
            XCTAssertEqual(retained.content, content)
            XCTAssertTrue(try library.notes(articleId: retained.articleId).isEmpty)
            let oversizedMutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.update", articleId: articleA.id, patch: NativeLibraryPatch(content: content), noteId: note.id)
            XCTAssertTrue(try library.exceedsSyncLimit(oversizedMutation))
            XCTAssertEqual(try library.syncState().pendingCount, 0)
        }
    }

    func testDuplicateLocalAliasesShareStableAnnotationsWithoutRelationshipMoves() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("annotation-aliases-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("fixture.sqlite").path
        let library = try Library(path: path)
        let localA = try library.saveURL("https://example.com/article")
        let oversizedOriginal = String(repeating: "a", count: 200_001)
        try library.saveContent(id: localA.id, title: "Local original", text: oversizedOriginal)
        try library.enableAnnotationSync(session: session())
        let remote = remote()
        let note = webNote(article: remote)
        let highlight = wireHighlight(article: remote)
        try library.apply(page(remote, notes: [note], highlights: [highlight]), after: nil)
        let localB = try XCTUnwrap(library.articles().first { $0.id != localA.id }?.id)
        try library.saveContent(id: localA.id, title: "Repaired local", text: "Repaired local source quote")
        try library.updateNote(id: note.id, content: "Initial pending edit")
        let api = AnnotationFixtureAPI()
        api.onPush = { mutations in
            NativeLibraryAcknowledgment(protocolVersion: 2, results: mutations.map {
                NativeLibraryMutationResult(mutationId: $0.mutationId, status: "applied", articleId: remote.id, annotationId: $0.annotationID, effectRevision: $0.isAnnotation ? "4" : nil)
            })
        }
        var serverNote = note; serverNote.content = "Initial pending edit"
        api.onPull = { _ in NativeLibraryPage(protocolVersion: 2, changes: [self.atRevision(self.page(remote, notes: [serverNote], highlights: [highlight]).changes[0], "5")], cursor: "aliases-mapped", hasMore: false) }
        try await library.sync(session: session(), client: api)
        XCTAssertEqual(try library.articleServerID(localA.id), remote.id)
        XCTAssertEqual(try library.articleServerID(localB), remote.id)
        XCTAssertEqual(Set(try library.articles().map(\.id)), [localA.id, localB])
        XCTAssertEqual(try library.notes(articleId: localA.id).map(\.id), [note.id])
        XCTAssertEqual(try library.notes(articleId: localB).map(\.id), [note.id])
        XCTAssertTrue(try library.textSnapshots(articleID: localA.id).contains { $0.text == oversizedOriginal })
        XCTAssertTrue(try library.textSnapshots(articleID: localA.id).contains { $0.text == "Repaired local source quote" })
        var frozenBytes: Data?
        for (index, order) in [[localA.id, localB], [localB, localA.id]].enumerated() {
            try await library.database.write { db in
                let rows = try Row.fetchAll(db, sql: "SELECT * FROM native_mapping WHERE serverID = ?", arguments: [remote.id])
                try db.execute(sql: "DELETE FROM native_mapping WHERE serverID = ?", arguments: [remote.id])
                for alias in order {
                    let row = try XCTUnwrap(rows.first { let id: String = $0["localID"]; return id == alias })
                    let clientID: String = row["clientID"]; let deleted: Bool = row["deleted"]; let unavailable: Bool = row["contentUnavailable"]
                    try db.execute(sql: "INSERT INTO native_mapping(localID, clientID, serverID, deleted, contentUnavailable) VALUES (?, ?, ?, ?, ?)", arguments: [alias, clientID, remote.id, deleted, unavailable])
                }
            }
            let content = "Shared pending edit \(index)"
            try library.updateNote(id: note.id, content: content)
            let shared = try library.createNote(articleId: localA.id, content: "Independent alias note")
            XCTAssertEqual(shared.articleId, localB)
            let text = try XCTUnwrap(library.articles().first { $0.id == localA.id }?.text)
            _ = try library.addHighlight(articleId: localA.id, content: text, range: (text as NSString).range(of: "Canonical"))
            let frozen = try XCTUnwrap(library.prepareBatch().first)
            let bytes = try NativeLibraryWire.encoder().encode(frozen.mutation)
            if let frozenBytes { XCTAssertEqual(bytes, frozenBytes) } else { frozenBytes = bytes }
            let current = atRevision(page(remote, notes: [serverNote], highlights: [highlight]).changes[0], "6")
            try library.apply(NativeLibraryPage(protocolVersion: 2, changes: [current], cursor: "alias-order-\(index)", hasMore: false), after: try library.syncCursor())
            for alias in [localA.id, localB] {
                XCTAssertEqual(try library.notes(articleId: alias).first { $0.id == note.id }?.content, content)
                XCTAssertTrue(try library.notes(articleId: alias).contains { $0.id == shared.id })
                XCTAssertEqual(Set(try library.highlights(articleId: alias).map(\.id)), Set(try library.highlights(articleId: localB).map(\.id)))
            }
            let state = try storedState(library, kind: "note", id: note.id, articleId: localB)
            XCTAssertEqual(state?.generation, 0)
            XCTAssertEqual(try NativeLibraryWire.encoder().encode(try XCTUnwrap(library.prepareBatch().first).mutation), frozenBytes)
            try library.deleteNote(id: shared.id)
            XCTAssertFalse(try library.notes(articleId: localA.id).contains { $0.id == shared.id })
            XCTAssertFalse(try library.notes(articleId: localB).contains { $0.id == shared.id })
        }
        try library.setHighlightColor(id: highlight.id, color: .red)
        XCTAssertEqual(try library.highlights(articleId: localA.id).first { $0.id == highlight.id }?.color, .red)
        XCTAssertEqual(try library.highlights(articleId: localB).first { $0.id == highlight.id }?.color, .red)
        let queued = try storedPending(library)
        XCTAssertTrue(queued.allSatisfy { !$0.mutation.isAnnotation || ($0.localID == localB && $0.mutation.articleId == remote.id) })
        let reopened = try Library(path: path, syncEnabled: true)
        XCTAssertEqual(try reopened.notes(articleId: localA.id).first { $0.id == note.id }?.articleId, localB)
        XCTAssertEqual(try NativeLibraryWire.encoder().encode(try XCTUnwrap(reopened.prepareBatch().first).mutation), frozenBytes)
        try reopened.deleteNote(id: note.id)
        XCTAssertFalse(try reopened.notes(articleId: localA.id).contains { $0.id == note.id })
        XCTAssertFalse(try reopened.notes(articleId: localB).contains { $0.id == note.id })
    }

    func testNewerDeleteACKRetiresOlderDeferredTextAndColorAssignments() async throws {
        for kind in ["note", "highlight"] {
            let (library, articleA, localA) = try fixture()
            let articleB = remote(text: articleA.text)
            let highlight = wireHighlight(article: articleA)
            let note = webNote(article: articleA)
            try library.apply(page(articleA, notes: [note], highlights: [highlight]), after: "page")
            if kind == "note" { try library.updateNote(id: note.id, content: "Older offline edit") }
            else { try library.setHighlightColor(id: highlight.id, color: .pink) }
            let frozen = try XCTUnwrap(library.prepareBatch().first)
            let frozenBytes = try NativeLibraryWire.encoder().encode(frozen.mutation)
            let api = AnnotationFixtureAPI()
            var deletedWhileRequestWasOutstanding = false
            api.onPush = { mutations in
                let mutation = try XCTUnwrap(mutations.first)
                XCTAssertEqual(mutation.articleId, articleA.id)
                if !deletedWhileRequestWasOutstanding {
                    deletedWhileRequestWasOutstanding = true
                    if kind == "note" { try library.deleteNote(id: note.id) }
                    else { try library.deleteHighlight(id: highlight.id) }
                    XCTAssertEqual(try NativeLibraryWire.encoder().encode(mutation), frozenBytes)
                }
                return AnnotationFixtureAPI.ack(mutations, status: "deleted", effectRevision: "6", permanentDeletion: false)
            }
            var movedNote = note; movedNote.articleId = articleB.id
            var movedHighlight = highlight; movedHighlight.articleId = articleB.id
            api.onPull = { _ in
                XCTAssertEqual(api.pushes.count, 2)
                XCTAssertTrue(try self.storedDeferred(library).isEmpty)
                return NativeLibraryPage(protocolVersion: 2, changes: [self.atRevision(self.page(articleB, notes: [movedNote], highlights: [movedHighlight]).changes[0], "3")], cursor: "after-newer-delete", hasMore: false)
            }
            try await library.sync(session: session(), client: api)
            let localB = try XCTUnwrap(library.articles().first { $0.id != localA }?.id)
            XCTAssertEqual(api.pushes.count, 2) // The retired old edit must never become a fresh B update.
            XCTAssertEqual(api.pushes.flatMap { $0 }.map(\.kind), [kind + ".update", kind + ".delete"])
            XCTAssertEqual(try library.notes(articleId: localB).first?.content, note.content)
            XCTAssertEqual(try library.highlights(articleId: localB).first?.color, highlight.color)
            XCTAssertTrue(try storedDeferred(library).isEmpty)
            XCTAssertEqual(try library.syncState().pendingCount, 0)
            XCTAssertEqual(try library.syncCursor(), "after-newer-delete")
        }
    }

}
