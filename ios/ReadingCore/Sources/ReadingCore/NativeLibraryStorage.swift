import Foundation
import GRDB

public struct NativeLibrarySyncState: Sendable, Equatable {
    public let pendingCount: Int
    public let lastSuccess: Date?
    public let lastError: String?
    public let isSyncing: Bool
}

/// Original text is never reanchored by guessed offsets. Highlight.range(in:) still checks its exact hash.
public struct NativeLibraryTextSnapshot: Codable, FetchableRecord, Sendable, Equatable {
    public let localID: String
    public let title: String
    public let text: String
    public let contentHash: String
    public let format: String
    public let capturedAt: Date
    public let source: String
    public var contentUnavailable: Bool? = nil
}

struct NativeLibraryPending: FetchableRecord {
    let sequence: Int64
    let localID: String
    let mutation: NativeLibraryMutation
    let frozen: Bool
    let overlayFlags: Bool
    let annotationRevision: String?
    let annotationGeneration: Int?
    init(row: Row) throws {
        sequence = row["sequence"]; localID = row["localID"]; frozen = row["frozen"]; overlayFlags = row["overlayFlags"]; annotationRevision = row["annotationRevision"]; annotationGeneration = row["annotationGeneration"]
        let data: Data = row["payload"]
        mutation = try NativeLibraryWire.decoder().decode(NativeLibraryMutation.self, from: data)
    }
}

extension Library {
    static func registerNativeLibraryMigration(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v4-native-library-sync") { db in
            // SQLite's rebuild procedure drops URL uniqueness while leaving highlight FKs pointing at article.
            // GRDB disables FK enforcement for the migration and checks integrity before committing.
            try db.execute(sql: """
                CREATE TABLE article_native (
                    id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
                    text TEXT NOT NULL, note TEXT NOT NULL, isRead BOOLEAN NOT NULL,
                    isFavorite BOOLEAN NOT NULL, createdAt DATETIME NOT NULL, error TEXT,
                    downloadSuppressed BOOLEAN NOT NULL DEFAULT 0, isArchived BOOLEAN NOT NULL DEFAULT 0
                );
                INSERT INTO article_native SELECT *, 0 FROM article;
                DROP TABLE article;
                ALTER TABLE article_native RENAME TO article;
                CREATE INDEX article_url ON article(url);
                CREATE TABLE native_mapping (
                    localID TEXT PRIMARY KEY NOT NULL,
                    clientID TEXT NOT NULL UNIQUE,
                    serverID TEXT,
                    deleted BOOLEAN NOT NULL DEFAULT 0,
                    contentUnavailable BOOLEAN NOT NULL DEFAULT 0
                );
                CREATE INDEX native_mapping_server ON native_mapping(serverID);
                CREATE TABLE native_pending (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    mutationID TEXT NOT NULL UNIQUE,
                    localID TEXT NOT NULL,
                    payload BLOB NOT NULL,
                    frozen BOOLEAN NOT NULL DEFAULT 0,
                    overlayFlags BOOLEAN NOT NULL DEFAULT 0
                );
                CREATE INDEX native_pending_local ON native_pending(localID, sequence);
                CREATE TABLE native_sync_state (
                    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                    namespace TEXT, cursor TEXT, lastSuccess DATETIME, lastError TEXT
                );
                INSERT INTO native_sync_state(singleton) VALUES (1);
                CREATE TABLE native_text_snapshot (
                    localID TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL,
                    contentHash TEXT NOT NULL, format TEXT NOT NULL,
                    capturedAt DATETIME NOT NULL, source TEXT NOT NULL,
                    PRIMARY KEY(localID, contentHash, source)
                );
                CREATE TABLE native_canonical_text (
                    localID TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL,
                    contentHash TEXT NOT NULL, format TEXT NOT NULL,
                    capturedAt DATETIME NOT NULL, source TEXT NOT NULL
                );
                """)
            for article in try Article.fetchAll(db) {
                if !article.text.isEmpty {
                    try db.execute(sql: "INSERT INTO native_text_snapshot VALUES (?, ?, ?, ?, ?, ?, ?)",
                        arguments: [article.id, article.title, article.text, Highlight.contentHash(article.text), "local-text-v1", Date(), "local"])
                }
            }
        }
    }

    /// Call only for the real account-scoped app library. Existing reader fixtures remain local-only.
    /// Passing the session here binds ownership before the first network operation.
    public func enableSync(session: NativeAuthSession? = nil) throws {
        try database.write { db in
            if let session { try bind(session, in: db) }
            for article in try Article.fetchAll(db, sql: "SELECT article.* FROM article LEFT JOIN native_mapping ON localID = article.id WHERE localID IS NULL") {
                try enqueueCreate(article, in: db)
                if article.isArchived { try enqueuePatch(id: article.id, patch: NativeLibraryPatch(isArchived: true), in: db) }
            }
            if annotationSyncEnabled {
                for serverID in try String.fetchAll(db, sql: "SELECT DISTINCT serverID FROM native_mapping WHERE serverID IS NOT NULL") {
                    _ = try Self.canonicalizeAnnotationAliases(serverID: serverID, in: db)
                }
            }
        }
        syncEnabled = true
    }

    public func articleServerID(_ localID: String) throws -> String? {
        try database.read { try String.fetchOne($0, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [localID]) }
    }

    public func syncState() throws -> NativeLibrarySyncState {
        try database.read { db in
            let row = try Row.fetchOne(db, sql: "SELECT * FROM native_sync_state WHERE singleton = 1")!
            return NativeLibrarySyncState(pendingCount: try Int.fetchOne(db, sql: "SELECT (SELECT COUNT(*) FROM native_pending) + (SELECT COUNT(*) FROM native_annotation_deferred)")!,
                lastSuccess: row["lastSuccess"], lastError: row["lastError"], isSyncing: activeSync != nil)
        }
    }

    /// Latest validated server canonical text, even while a pending local create overlays reader text.
    public func canonicalTextSnapshot(articleID: String) throws -> NativeLibraryTextSnapshot? {
        try database.read { try NativeLibraryTextSnapshot.fetchOne($0, sql: "SELECT native_canonical_text.*, native_mapping.contentUnavailable FROM native_canonical_text JOIN native_mapping USING(localID) WHERE localID = ?", arguments: [articleID]) }
    }

    /// Explicitly undo download cleanup using the latest retained server text, including text:// saves.
    /// Clears suppression even when returning false so a safe authenticated pull can restore text.
    /// Never fetches or enqueues a create.
    @discardableResult public func restoreDownloadedText(id: String) throws -> Bool {
        try database.write { db in
            guard try !isDeleted(id: id, in: db),
                  let old = try Article.fetchOne(db, key: id) else { return false }
            guard let canonical = try NativeLibraryTextSnapshot.fetchOne(db, sql: "SELECT * FROM native_canonical_text WHERE localID = ?", arguments: [id]),
                  canonical.format == "paper-drive-text-v1", !canonical.text.isEmpty,
                  canonical.contentHash == Highlight.contentHash(canonical.text) else {
                try db.execute(sql: "UPDATE article SET downloadSuppressed = 0 WHERE id = ?", arguments: [id])
                return false
            }
            try retainText(old, in: db)
            let unavailable = try Bool.fetchOne(db, sql: "SELECT contentUnavailable FROM native_mapping WHERE localID = ?", arguments: [id]) ?? false
            let error = try pending(in: db, id: id).compactMap { try quarantineError($0.mutation) }.first
            try db.execute(sql: "UPDATE article SET title = ?, text = ?, downloadSuppressed = 0, error = ? WHERE id = ?",
                arguments: [canonical.title, canonical.text, error?.errorDescription ?? (unavailable ? NativeLibraryError.contentUnavailable.errorDescription : nil), id])
            return true
        }
    }

    /// Includes legacy originals and previous canonical versions. These survive remote deletion and download cleanup.
    public func textSnapshots(articleID: String) throws -> [NativeLibraryTextSnapshot] {
        try database.read { try NativeLibraryTextSnapshot.fetchAll($0, sql: "SELECT * FROM native_text_snapshot WHERE localID = ? ORDER BY capturedAt, contentHash, source", arguments: [articleID]) }
    }

    public func toggleArchived(id: String) throws {
        try database.write { db in
            try db.execute(sql: "UPDATE article SET isArchived = NOT isArchived WHERE id = ?", arguments: [id])
            if syncEnabled, let article = try Article.fetchOne(db, key: id) {
                try enqueuePatch(id: id, patch: NativeLibraryPatch(isArchived: article.isArchived), in: db)
            }
        }
    }

    func bind(_ session: NativeAuthSession, in db: Database) throws {
        guard session.expiresAt > Date(), !session.user.id.isEmpty,
              let normalized = try? NativeAuthServer.normalized(session.server.absoluteString, allowLocalhost: true),
              normalized == session.server else { throw NativeLibraryError.invalidSession }
        if let existing = try String.fetchOne(db, sql: "SELECT namespace FROM native_sync_state WHERE singleton = 1"), existing != session.namespace {
            throw NativeLibraryError.accountMismatch
        }
        try db.execute(sql: "UPDATE native_sync_state SET namespace = ? WHERE singleton = 1", arguments: [session.namespace])
    }

    func retainText(_ article: Article, in db: Database) throws {
        guard !article.text.isEmpty else { return }
        try db.execute(sql: "INSERT OR IGNORE INTO native_text_snapshot VALUES (?, ?, ?, ?, ?, ?, ?)",
            arguments: [article.id, article.title, article.text, Highlight.contentHash(article.text), "local-text-v1", Date(), "local"])
    }

    func ensureMapping(id: String, in db: Database) throws -> String {
        if let clientID = try String.fetchOne(db, sql: "SELECT clientID FROM native_mapping WHERE localID = ?", arguments: [id]) { return clientID }
        let clientID = UUID(uuidString: id) != nil ? id.lowercased() : UUID().uuidString.lowercased()
        try db.execute(sql: "INSERT INTO native_mapping(localID, clientID) VALUES (?, ?)", arguments: [id, clientID])
        return clientID
    }

    func enqueueCreate(_ article: Article, in db: Database) throws {
        let isInitialCreate = try String.fetchOne(db, sql: "SELECT clientID FROM native_mapping WHERE localID = ?", arguments: [article.id]) == nil
        let clientID = try ensureMapping(id: article.id, in: db)
        guard try !isDeleted(id: article.id, in: db) else { return }
        // Supersede only never-sent creates. Once frozen, their idempotency payload is immutable.
        let targetID = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [article.id]) ?? clientID
        let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "create", articleId: targetID,
            url: article.url, title: article.title, text: article.text, isRead: article.isRead, isFavorite: article.isFavorite)
        if let sequence = try Int64.fetchOne(db, sql: "SELECT sequence FROM native_pending WHERE localID = ? AND frozen = 0 AND json_extract(CAST(payload AS TEXT), '$.kind') = 'create' ORDER BY sequence LIMIT 1", arguments: [article.id]) {
            let payload = try NativeLibraryWire.encoder().encode(mutation)
            try db.execute(sql: "UPDATE native_pending SET mutationID = ?, payload = ? WHERE sequence = ?", arguments: [mutation.mutationId, payload, sequence])
        } else { try enqueue(mutation, localID: article.id, overlayFlags: isInitialCreate, in: db) }
        if let error = try quarantineError(mutation) {
            try db.execute(sql: "UPDATE article SET error = ? WHERE id = ?", arguments: [error.errorDescription, article.id])
        }
    }

    func validateLocalSyncContent(id: String) throws {
        guard syncEnabled else { return }
        let error = try database.read { db in
            try pending(in: db, id: id).compactMap { try quarantineError($0.mutation) }.first
        }
        if let error { throw error }
    }

    func quarantineError(_ mutation: NativeLibraryMutation) throws -> NativeLibraryError? {
        if mutation.isAnnotation {
            if (mutation.content ?? mutation.patch?.content ?? "").contains("\0") { return .invalidAnnotation }
            if mutation.kind == "highlight.create", mutation.sourceAnchor?.isValid != true { return .invalidAnnotation }
        }
        if mutation.kind == "create", !NativeLibraryWire.isPublicURL(mutation.url ?? "") { return .invalidURL }
        return try exceedsSyncLimit(mutation) ? .tooLarge : nil
    }

    func exceedsSyncLimit(_ mutation: NativeLibraryMutation) throws -> Bool {
        if let text = mutation.text, text.utf16.count > NativeLibraryWire.maxCreateTextUTF16 { return true }
        if let content = mutation.content ?? mutation.patch?.content, content.utf16.count > 200_000 { return true }
        if let source = mutation.sourceAnchor, source.text.utf16.count > 200_000 { return true }
        if let title = mutation.title, title.utf16.count > 2048 { return true }
        if let url = mutation.url, url.utf16.count > 8192 { return true }
        return try NativeLibraryWire.encoder().encode(NativeLibraryWire.Batch(protocolVersion: annotationSyncEnabled ? 2 : 1, mutations: [mutation])).count > NativeLibraryWire.maxRequestBytes
    }

    func enqueuePatch(id: String, patch: NativeLibraryPatch, in db: Database) throws {
        let clientID = try ensureMapping(id: id, in: db)
        guard try !isDeleted(id: id, in: db) else { return }
        try enqueue(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "update", articleId: clientID, patch: patch), localID: id, in: db)
    }

    func enqueueDelete(id: String, in db: Database) throws {
        let clientID = try ensureMapping(id: id, in: db)
        // An explicit local delete supersedes only assignments that have never been sent.
        // In-flight payloads remain immutable and resolve their server mapping before this delete.
        try db.execute(sql: "DELETE FROM native_pending WHERE localID = ? AND frozen = 0", arguments: [id])
        try enqueue(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "delete", articleId: clientID), localID: id, in: db)
        try db.execute(sql: "UPDATE native_mapping SET deleted = 1 WHERE localID = ?", arguments: [id])
    }

    func enqueue(_ mutation: NativeLibraryMutation, localID: String, overlayFlags: Bool = false, in db: Database) throws {
        let payload = try NativeLibraryWire.encoder().encode(mutation)
        try db.execute(sql: "INSERT INTO native_pending(mutationID, localID, payload, overlayFlags) VALUES (?, ?, ?, ?)", arguments: [mutation.mutationId, localID, payload, overlayFlags])
    }

    func isDeleted(id: String, in db: Database) throws -> Bool {
        try Bool.fetchOne(db, sql: "SELECT deleted FROM native_mapping WHERE localID = ?", arguments: [id]) ?? false
    }

    func pending(in db: Database, id: String? = nil) throws -> [NativeLibraryPending] {
        if let id { return try NativeLibraryPending.fetchAll(db, sql: "SELECT * FROM native_pending WHERE localID = ? ORDER BY sequence", arguments: [id]) }
        return try NativeLibraryPending.fetchAll(db, sql: "SELECT * FROM native_pending ORDER BY sequence")
    }

    /// Freeze before dispatch, so a crash between a server commit and local ACK retries exactly.
    /// Per-local-ID serialization lets URL-deduplicated create results resolve before updates/deletes are frozen.
    func prepareBatch() throws -> [NativeLibraryPending] {
        try database.write { db in
            var selected: [NativeLibraryPending] = []
            var localIDs: Set<String> = []
            var blockedUnmappedIDs: Set<String> = []
            for var item in try pending(in: db) {
                guard !localIDs.contains(item.localID) else { continue }
                if item.mutation.isAnnotation {
                    guard annotationSyncEnabled else { localIDs.insert(item.localID); continue }
                    if !item.frozen, !item.mutation.kind.hasSuffix(".delete"), let id = item.mutation.annotationID,
                       try annotationDeleted(kind: item.mutation.kind.hasPrefix("note.") ? "note" : "highlight", id: id, articleId: item.localID, in: db) {
                        // If a verified old-parent miss is already waiting for its live
                        // destination, preserve a newer unsent assignment in that same durable slot.
                        let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
                        if try !annotationPermanentlyDeleted(kind: kind, id: id, in: db),
                           try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM native_annotation_deferred WHERE kind = ? AND id = ?)", arguments: [kind, id]) == true {
                            try deferAnnotationAssignment(item, in: db)
                        }
                        // Frozen receipts still retry unchanged; only never-sent work can be superseded.
                        try db.execute(sql: "DELETE FROM native_pending WHERE sequence = ? AND mutationID = ? AND frozen = 0", arguments: [item.sequence, item.mutation.mutationId])
                        continue
                    }
                    guard try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [item.localID]) != nil else { localIDs.insert(item.localID); continue }
                }
                if let error = try quarantineError(item.mutation) {
                    if item.mutation.isAnnotation { localIDs.insert(item.localID) }
                    try db.execute(sql: "UPDATE article SET error = ? WHERE id = ?", arguments: [error.errorDescription, item.localID])
                    if try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [item.localID]) == nil {
                        blockedUnmappedIDs.insert(item.localID)
                    }
                    continue
                }
                if blockedUnmappedIDs.contains(item.localID), item.mutation.kind != "delete" { continue }
                localIDs.insert(item.localID)
                if !item.frozen {
                    var mutation = item.mutation
                    if let serverID = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [item.localID]) {
                        mutation.articleId = serverID
                    }
                    let data = try NativeLibraryWire.encoder().encode(mutation)
                    let kind = mutation.kind.hasPrefix("note.") ? "note" : "highlight"
                    let annotationRevision = mutation.isAnnotation ? try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, mutation.annotationID, item.localID]) : nil
                    let generation = mutation.isAnnotation ? try Int.fetchOne(db, sql: "SELECT generation FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, mutation.annotationID, item.localID]) : nil
                    try db.execute(sql: "UPDATE native_pending SET payload = ?, frozen = 1, annotationRevision = ?, annotationGeneration = ? WHERE sequence = ?", arguments: [data, annotationRevision, generation, item.sequence])
                    item = try NativeLibraryPending.fetchOne(db, sql: "SELECT * FROM native_pending WHERE sequence = ?", arguments: [item.sequence])!
                }
                let proposed = selected.map(\.mutation) + [item.mutation]
                if try NativeLibraryWire.encoder().encode(NativeLibraryWire.Batch(protocolVersion: annotationSyncEnabled ? 2 : 1, mutations: proposed)).count > NativeLibraryWire.maxRequestBytes {
                    if selected.isEmpty { throw NativeLibraryError.tooLarge }
                    break
                }
                selected.append(item)
                if selected.count == 25 { break }
            }
            return selected
        }
    }

    func acknowledge(_ acknowledgment: NativeLibraryAcknowledgment, batch: [NativeLibraryPending]) throws {
        guard acknowledgment.protocolVersion == (annotationSyncEnabled ? 2 : 1), acknowledgment.results.count == batch.count,
              Set(acknowledgment.results.map(\.mutationId)) == Set(batch.map { $0.mutation.mutationId }) else { throw NativeLibraryError.invalidResponse }
        let sent = Dictionary(uniqueKeysWithValues: batch.map { ($0.mutation.mutationId, $0) })
        for result in acknowledgment.results {
            if let revision = result.effectRevision {
                guard !revision.isEmpty, revision.utf8.count <= 128, revision.utf8.allSatisfy({ (48...57).contains($0) }) else { throw NativeLibraryError.invalidResponse }
            }
            if result.permanentDeletion != nil {
                guard result.status == "deleted", sent[result.mutationId]?.mutation.isAnnotation == true else { throw NativeLibraryError.invalidResponse }
            }
            guard ["applied", "deleted"].contains(result.status), UUID(uuidString: result.articleId) != nil,
                  let item = sent[result.mutationId],
                  item.mutation.kind == "create" || result.articleId == item.mutation.articleId,
                  (!item.mutation.kind.hasSuffix(".delete") && item.mutation.kind != "delete") || result.status == "deleted",
                  !item.mutation.isAnnotation || result.annotationId == nil || result.annotationId?.lowercased() == item.mutation.annotationID?.lowercased() else { throw NativeLibraryError.invalidResponse }
        }
        try database.write { db in
            // Preserve durable assignment order even if the transport returns receipts out of order.
            for result in acknowledgment.results.sorted(by: { sent[$0.mutationId]!.sequence < sent[$1.mutationId]!.sequence }) {
                let item = sent[result.mutationId]!
                // A cancelled/replaced job cannot clear another job's queued assignment.
                guard try String.fetchOne(db, sql: "SELECT mutationID FROM native_pending WHERE sequence = ?", arguments: [item.sequence]) == result.mutationId else { throw NativeLibraryError.invalidResponse }
                if let mappedID = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [item.localID]), mappedID != result.articleId {
                    throw NativeLibraryError.invalidResponse
                }
                if item.mutation.isAnnotation {
                    let context = try annotationParentID(item.localID, in: db)
                    if result.status == "deleted", let id = item.mutation.annotationID {
                        let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
                        if result.permanentDeletion == true {
                            try recordPermanentAnnotationDeletion(kind: kind, id: id, revision: result.effectRevision, in: db)
                        } else if let effectRevision = result.effectRevision {
                            // The server effect, rather than dispatch time or the pull cursor,
                            // orders this exact receipt against even an unobserved round-trip move.
                            try tombstoneAnnotation(kind: kind, id: id, articleId: context, reason: "server-delete", revision: effectRevision, cascade: result.permanentDeletion == nil, in: db)
                        } else {
                            // Compatibility with receipts minted before effect revisions existed.
                            let currentGeneration = try Int.fetchOne(db, sql: "SELECT generation FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, context]) ?? 0
                            if currentGeneration == (item.annotationGeneration ?? 0) {
                                try tombstoneAnnotation(kind: kind, id: id, articleId: context, reason: "server-delete", cascade: result.permanentDeletion == nil, in: db)
                            }
                        }
                    }
                    if result.status == "applied", let effectRevision = result.effectRevision, let id = item.mutation.annotationID {
                        try recordAppliedAnnotationEffect(kind: item.mutation.kind.hasPrefix("note.") ? "note" : "highlight", id: id, articleId: context, revision: effectRevision, in: db)
                    }
                    try db.execute(sql: "DELETE FROM native_pending WHERE sequence = ? AND mutationID = ?", arguments: [item.sequence, result.mutationId])
                    if item.mutation.kind.hasSuffix(".delete"), let id = item.mutation.annotationID {
                        // A newer explicit delete supersedes older deferred assignments even
                        // when this parent-context delete becomes an old-parent miss.
                        let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
                        try db.execute(sql: "DELETE FROM native_annotation_deferred WHERE kind = ? AND id = ? AND sequence < ?", arguments: [kind, id, item.sequence])
                    }
                    if result.status == "deleted", result.permanentDeletion == false {
                        try deferAnnotationAssignment(item, in: db)
                        if let id = item.mutation.annotationID {
                            try routeDeferredAnnotation(kind: item.mutation.kind.hasPrefix("note.") ? "note" : "highlight", id: id, in: db)
                        }
                    } else if result.status == "deleted", result.permanentDeletion != true, let effectRevision = result.effectRevision {
                        try rebaseAssignmentAfterStaleReceipt(item, effectRevision: effectRevision, in: db)
                    }
                    if let id = item.mutation.annotationID {
                        try reconcileAnnotationDeleteOverlay(kind: item.mutation.kind.hasPrefix("note.") ? "note" : "highlight", id: id, articleId: context, in: db)
                    }
                    continue
                }
                if result.status == "deleted", let article = try Article.fetchOne(db, key: item.localID) {
                    try retainText(article, in: db)
                    try retainArticleAnnotations(id: item.localID, in: db)
                }
                try db.execute(sql: "UPDATE native_mapping SET serverID = ?, deleted = MAX(deleted, ?) WHERE localID = ?",
                    arguments: [result.articleId, result.status == "deleted", item.localID])
                try db.execute(sql: "DELETE FROM native_pending WHERE sequence = ? AND mutationID = ?", arguments: [item.sequence, result.mutationId])
                if annotationSyncEnabled {
                    _ = try Self.canonicalizeAnnotationAliases(serverID: result.articleId, in: db)
                }
                if item.mutation.kind == "create", result.status == "applied" {
                    try reconcileCanonicalAfterCreate(id: item.localID, in: db)
                }
            }
        }
    }

    func apply(_ page: NativeLibraryPage, after cursor: String?) throws {
        try validate(page, after: cursor)
        try database.write { db in
            for change in page.changes { try apply(change, in: db) }
            try db.execute(sql: "UPDATE native_sync_state SET cursor = ? WHERE singleton = 1", arguments: [page.cursor])
        }
    }

    private func validate(_ page: NativeLibraryPage, after cursor: String?) throws {
        guard page.protocolVersion == (annotationSyncEnabled ? 2 : 1), page.changes.count <= 50, !page.cursor.isEmpty, page.cursor.utf8.count <= 8192,
              !page.hasMore || (!page.changes.isEmpty && page.cursor != cursor),
              Set(page.changes.map(\.id)).count == page.changes.count else { throw NativeLibraryError.invalidResponse }
        for change in page.changes {
            guard UUID(uuidString: change.id) != nil, !change.revision.isEmpty, change.revision.utf8.count <= 128,
                  change.revision.utf8.allSatisfy({ (48...57).contains($0) }) else { throw NativeLibraryError.invalidResponse }
            if change.deleted {
                guard change.article == nil, change.annotations == nil else { throw NativeLibraryError.invalidResponse }; continue
            }
            guard let article = change.article, article.id == change.id, article.format == "paper-drive-text-v1",
                  article.contentHash == Highlight.contentHash(article.text),
                  article.contentUnavailable != true || article.text.isEmpty, article.title.utf8.count <= 1_048_576,
                  article.text.utf8.count <= 1_048_576, article.url.utf8.count <= 16_384,
                  article.createdAt.timeIntervalSince1970.isFinite, article.updatedAt.timeIntervalSince1970.isFinite,
                  article.updatedAt >= article.createdAt,
                  let url = URLComponents(string: article.url), let scheme = url.scheme?.lowercased(),
                  ["http", "https", "text"].contains(scheme), url.user == nil, url.password == nil,
                  scheme == "text" || !(url.host ?? "").isEmpty else { throw NativeLibraryError.invalidResponse }
            if let annotations = change.annotations {
                guard page.protocolVersion == 2 else { throw NativeLibraryError.invalidResponse }
                try annotations.validate(article: article)
            }
            if page.protocolVersion == 2 {
                guard change.annotations != nil, try NativeLibraryWire.responseEncoder().encode(change).count <= NativeLibraryWire.maxRequestBytes else { throw NativeLibraryError.invalidResponse }
            }
        }
    }

    private func apply(_ change: NativeLibraryChange, in db: Database) throws {
        var localIDs = try String.fetchAll(db, sql: "SELECT localID FROM native_mapping WHERE serverID = ? OR (serverID IS NULL AND clientID = ?)", arguments: [change.id, change.id])
        if localIDs.isEmpty {
            let localID = UUID().uuidString.lowercased()
            try db.execute(sql: "INSERT INTO native_mapping(localID, clientID, serverID, deleted) VALUES (?, ?, ?, ?)",
                arguments: [localID, UUID().uuidString.lowercased(), change.id, change.deleted])
            localIDs = [localID]
        }
        for localID in localIDs {
            try db.execute(sql: "UPDATE native_mapping SET serverID = ? WHERE localID = ?", arguments: [change.id, localID])
            if change.deleted {
                if let article = try Article.fetchOne(db, key: localID) {
                    try retainText(article, in: db)
                    try retainArticleAnnotations(id: localID, in: db)
                }
                // Remote deletes hide rather than cascade-delete local notes/highlights.
                try db.execute(sql: "UPDATE native_mapping SET deleted = 1 WHERE localID = ?", arguments: [localID])
                continue
            }
            guard try !isDeleted(id: localID, in: db), let remote = change.article else { continue }
            let old = try Article.fetchOne(db, key: localID)
            if let old, old.text != remote.text { try retainText(old, in: db) }
            if let canonical = try NativeLibraryTextSnapshot.fetchOne(db, sql: "SELECT * FROM native_canonical_text WHERE localID = ?", arguments: [localID]) {
                try db.execute(sql: "INSERT OR IGNORE INTO native_text_snapshot VALUES (?, ?, ?, ?, ?, ?, ?)",
                    arguments: [localID, canonical.title, canonical.text, canonical.contentHash, canonical.format, canonical.capturedAt, canonical.source])
            }
            try db.execute(sql: "INSERT OR REPLACE INTO native_canonical_text VALUES (?, ?, ?, ?, ?, ?, ?)",
                arguments: [localID, remote.title, remote.text, remote.contentHash, remote.format, remote.updatedAt, "server"])
            var article = Article(id: localID, url: remote.url, title: remote.title, text: remote.text,
                note: old?.note ?? "", isRead: remote.isRead, isFavorite: remote.isFavorite, createdAt: old?.createdAt ?? remote.createdAt, error: nil)
            try db.execute(sql: "UPDATE native_mapping SET contentUnavailable = ? WHERE localID = ?", arguments: [remote.contentUnavailable == true, localID])
            article.error = remote.contentUnavailable == true ? NativeLibraryError.contentUnavailable.errorDescription : nil
            article.isArchived = remote.isArchived
            article.downloadSuppressed = old?.downloadSuppressed ?? false
            try overlayPending(on: &article, in: db)
            if article.downloadSuppressed { article.text = "" }
            try article.save(db)
        }
        // Apply the annotation collection exactly once per server parent, even if several
        // local reader rows retain distinct downloads/text histories for that same article.
        if annotationSyncEnabled, !change.deleted, let remote = change.article, let annotations = change.annotations,
           let parent = try Self.canonicalizeAnnotationAliases(serverID: change.id, in: db), try !isDeleted(id: parent, in: db) {
            try applyAnnotations(annotations, article: remote, localID: parent, revision: change.revision, in: db)
        }
    }
    func quarantinedMutationError() throws -> NativeLibraryError? {
        try database.read { db in try pending(in: db).compactMap { try quarantineError($0.mutation) }.first }
    }

    private func overlayPending(on article: inout Article, in db: Database) throws {
        for pending in try pending(in: db, id: article.id) {
            let mutation = pending.mutation
            if mutation.kind == "create" {
                article.title = mutation.title ?? article.title; article.text = mutation.text ?? article.text
                if pending.overlayFlags {
                    article.isRead = mutation.isRead ?? article.isRead; article.isFavorite = mutation.isFavorite ?? article.isFavorite
                }
            }
            if let patch = mutation.patch {
                article.isRead = patch.isRead ?? article.isRead; article.isFavorite = patch.isFavorite ?? article.isFavorite
                article.isArchived = patch.isArchived ?? article.isArchived
            }
            if let error = try quarantineError(mutation) { article.error = error.errorDescription }
        }
    }

    /// An existing nonempty canonical record makes create a no-op, so an incremental pull may be empty.
    /// Restore that retained canonical view after ACK, while preserving both the download and newer edits.
    private func reconcileCanonicalAfterCreate(id: String, in db: Database) throws {
        guard try !isDeleted(id: id, in: db),
              let canonical = try NativeLibraryTextSnapshot.fetchOne(db, sql: "SELECT * FROM native_canonical_text WHERE localID = ?", arguments: [id]),
              let old = try Article.fetchOne(db, key: id) else { return }
        let unavailable = try Bool.fetchOne(db, sql: "SELECT contentUnavailable FROM native_mapping WHERE localID = ?", arguments: [id]) ?? false
        guard !canonical.text.isEmpty || unavailable else { return } // An empty native placeholder can still fill once.
        try retainText(old, in: db)
        var article = old
        article.title = canonical.title; article.text = article.downloadSuppressed ? "" : canonical.text
        article.error = unavailable ? NativeLibraryError.contentUnavailable.errorDescription : nil
        try overlayPending(on: &article, in: db)
        if article.downloadSuppressed { article.text = "" }
        try article.update(db)
    }

}
