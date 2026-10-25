import Foundation
import GRDB

extension Library {
    static func registerNativeAnnotationMigration(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v5-native-annotations") { db in
            try db.execute(sql: """
                CREATE TABLE library_note (
                    id TEXT PRIMARY KEY NOT NULL, articleId TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
                    highlightId TEXT, content TEXT NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
                );
                CREATE INDEX library_note_article ON library_note(articleId);
                CREATE TABLE native_annotation_state (
                    kind TEXT NOT NULL, id TEXT NOT NULL, articleId TEXT NOT NULL, deleted BOOLEAN NOT NULL DEFAULT 0, present BOOLEAN NOT NULL DEFAULT 1,
                    PRIMARY KEY(kind, id)
                );
                CREATE INDEX native_annotation_article ON native_annotation_state(articleId);
                CREATE TABLE native_annotation_import (
                    kind TEXT NOT NULL, legacyID TEXT NOT NULL, annotationID TEXT NOT NULL, PRIMARY KEY(kind, legacyID)
                );
                CREATE TABLE native_annotation_recovery (
                    id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, annotationID TEXT NOT NULL,
                    articleId TEXT NOT NULL, payload TEXT NOT NULL, capturedAt DATETIME NOT NULL, reason TEXT NOT NULL
                );
                ALTER TABLE native_sync_state ADD COLUMN annotationsEnabled BOOLEAN NOT NULL DEFAULT 0;
                CREATE TABLE highlight_v5 (
                    id TEXT PRIMARY KEY NOT NULL, articleId TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
                    text TEXT NOT NULL, startOffset INTEGER NOT NULL, endOffset INTEGER NOT NULL,
                    contextPrefix TEXT NOT NULL, contextSuffix TEXT NOT NULL, anchorContentHash TEXT NOT NULL,
                    color TEXT NOT NULL, createdAt DATETIME NOT NULL, version INTEGER NOT NULL,
                    sourceAnchor TEXT, canonicalAnchor TEXT, resolution TEXT, updatedAt DATETIME
                );
                INSERT INTO highlight_v5 SELECT *, NULL, NULL, NULL, NULL FROM highlight;
                DROP TABLE highlight;
                ALTER TABLE highlight_v5 RENAME TO highlight;
                CREATE INDEX highlight_article ON highlight(articleId);
                """)
        }
        migrator.registerMigration("v6-annotation-parent-context") { db in
            try db.execute(sql: """
                CREATE TABLE native_annotation_state_v6 (
                    kind TEXT NOT NULL, id TEXT NOT NULL, articleId TEXT NOT NULL,
                    deleted BOOLEAN NOT NULL DEFAULT 0, present BOOLEAN NOT NULL DEFAULT 1, revision TEXT, serverLive BOOLEAN NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(kind, id, articleId)
                );
                INSERT INTO native_annotation_state_v6(kind, id, articleId, deleted, present) SELECT * FROM native_annotation_state;
                DROP TABLE native_annotation_state;
                ALTER TABLE native_annotation_state_v6 RENAME TO native_annotation_state;
                CREATE INDEX native_annotation_article ON native_annotation_state(articleId);
                ALTER TABLE native_pending ADD COLUMN annotationRevision TEXT;
                ALTER TABLE native_pending ADD COLUMN annotationGeneration INTEGER;
                """)
        }
        migrator.registerMigration("v7-permanent-annotation-identities") { db in
            try db.execute(sql: """
                CREATE TABLE native_annotation_permanent (
                    kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT,
                    PRIMARY KEY(kind, id)
                );
                """)
        }
        migrator.registerMigration("v8-annotation-deferred-and-aliases") { db in
            try db.execute(sql: """
                CREATE TABLE native_annotation_deferred (
                    kind TEXT NOT NULL, id TEXT NOT NULL, sequence INTEGER NOT NULL, payload BLOB NOT NULL,
                    PRIMARY KEY(kind, id)
                );
                CREATE TABLE native_annotation_parent (serverID TEXT PRIMARY KEY NOT NULL, localID TEXT NOT NULL);
                """)
            if try Bool.fetchOne(db, sql: "SELECT annotationsEnabled FROM native_sync_state WHERE singleton = 1") == true {
                for serverID in try String.fetchAll(db, sql: "SELECT DISTINCT serverID FROM native_mapping WHERE serverID IS NOT NULL") {
                    _ = try Self.canonicalizeAnnotationAliases(serverID: serverID, in: db)
                }
            }
        }
    }

    /// Binds this library before importing any legacy content. The cursor reset and stable import IDs commit together.
    public func enableAnnotationSync(session: NativeAuthSession) throws {
        let wasEnabled = annotationSyncEnabled
        try database.write { db in
            try bind(session, in: db)
            for article in try Article.fetchAll(db, sql: "SELECT article.* FROM article LEFT JOIN native_mapping ON localID = article.id WHERE localID IS NULL") {
                try enqueueCreate(article, in: db)
                if article.isArchived { try enqueuePatch(id: article.id, patch: NativeLibraryPatch(isArchived: true), in: db) }
            }
            let enabled = try Bool.fetchOne(db, sql: "SELECT annotationsEnabled FROM native_sync_state WHERE singleton = 1") ?? false
            if !enabled { try db.execute(sql: "UPDATE native_sync_state SET cursor = NULL, annotationsEnabled = 1 WHERE singleton = 1") }
            for serverID in try String.fetchAll(db, sql: "SELECT DISTINCT serverID FROM native_mapping WHERE serverID IS NOT NULL") {
                _ = try Self.canonicalizeAnnotationAliases(serverID: serverID, in: db)
            }
            for article in try Article.fetchAll(db) where try !isDeleted(id: article.id, in: db) {
                // Highlights precede notes so a note can refer to an existing stable highlight ID.
                for var highlight in try Highlight.fetchAll(db, sql: "SELECT * FROM highlight WHERE articleId = ?", arguments: [article.id]) {
                    if try annotationDeleted(kind: "highlight", id: highlight.id, articleId: article.id, in: db) { continue }
                    if try markAnnotationImport(kind: "highlight", legacyID: highlight.id, annotationID: highlight.id, in: db) {
                        highlight.sourceAnchor = highlight.sourceAnchor ?? originalSource(highlight)
                        try highlight.update(db)
                        try setAnnotationState(kind: "highlight", id: highlight.id, articleId: article.id, deleted: false, in: db)
                        try enqueueHighlightCreate(highlight, in: db)
                    }
                }
                if !article.note.isEmpty, try String.fetchOne(db, sql: "SELECT annotationID FROM native_annotation_import WHERE kind = 'inline-note' AND legacyID = ?", arguments: [article.id]) == nil {
                    let note = LibraryNote(id: UUID().uuidString.lowercased(), articleId: try annotationParentID(article.id, in: db), highlightId: nil, content: article.note, createdAt: Date(), updatedAt: Date())
                    try note.insert(db)
                    _ = try markAnnotationImport(kind: "inline-note", legacyID: article.id, annotationID: note.id, in: db)
                    try setAnnotationState(kind: "note", id: note.id, articleId: note.articleId, deleted: false, in: db)
                    _ = try markAnnotationImport(kind: "note", legacyID: note.id, annotationID: note.id, in: db)
                    try enqueueNoteCreate(note, in: db)
                }
                for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE articleId = ?", arguments: [article.id]) {
                    if try annotationDeleted(kind: "note", id: note.id, articleId: article.id, in: db) { continue }
                    if try markAnnotationImport(kind: "note", legacyID: note.id, annotationID: note.id, in: db) { try enqueueNoteCreate(note, in: db) }
                }
            }
        }
        if !wasEnabled, activeSync != nil { cancelSync() }
        syncEnabled = true
        annotationSyncEnabled = true
    }

    public func notes(articleId: String) throws -> [LibraryNote] {
        try database.read { db in
            let parent = try annotationParentID(articleId, in: db)
            guard try !isDeleted(id: articleId, in: db), try !isDeleted(id: parent, in: db) else { return [] }
            return try LibraryNote.fetchAll(db, sql: "SELECT library_note.* FROM library_note LEFT JOIN native_annotation_state s ON s.kind = 'note' AND s.id = library_note.id AND s.articleId = library_note.articleId LEFT JOIN native_annotation_state hs ON hs.kind = 'highlight' AND hs.id = library_note.highlightId AND hs.articleId = library_note.articleId WHERE library_note.articleId = ? AND COALESCE(s.deleted, 0) = 0 AND COALESCE(s.present, 1) = 1 AND COALESCE(hs.deleted, 0) = 0 AND COALESCE(hs.present, 1) = 1 AND NOT EXISTS (SELECT 1 FROM native_annotation_permanent p WHERE (p.kind = 'note' AND p.id = lower(library_note.id)) OR (p.kind = 'highlight' AND p.id = lower(library_note.highlightId))) ORDER BY createdAt, library_note.id", arguments: [parent])
        }
    }

    @discardableResult public func createNote(articleId: String, content: String, highlightId: String? = nil) throws -> LibraryNote {
        try Self.validateNoteContent(content)
        return try database.write { db in
            try requireAnnotationArticle(articleId, in: db)
            let parent = try annotationParentID(articleId, in: db)
            try requireAnnotationArticle(parent, in: db)
            if let highlightId {
                guard let highlight = try Highlight.fetchOne(db, key: highlightId), try annotationParentID(highlight.articleId, in: db) == parent,
                      try !annotationDeleted(kind: "highlight", id: highlightId, articleId: articleId, in: db) else { throw HighlightError.invalidSelection }
            }
            let note = LibraryNote(id: UUID().uuidString.lowercased(), articleId: parent, highlightId: highlightId, content: content, createdAt: Date(), updatedAt: Date())
            try note.insert(db)
            try setAnnotationState(kind: "note", id: note.id, articleId: parent, deleted: false, in: db)
            if annotationSyncEnabled {
                _ = try markAnnotationImport(kind: "note", legacyID: note.id, annotationID: note.id, in: db)
                try enqueueNoteCreate(note, in: db)
            }
            return note
        }
    }

    public func updateNote(id: String, content: String) throws {
        try database.write { db in try updateNote(id: id, content: content, in: db) }
    }
    func updateNote(id: String, content: String, in db: Database) throws {
        try Self.validateNoteContent(content)
        guard var note = try LibraryNote.fetchOne(db, key: id), try !annotationDeleted(kind: "note", id: id, articleId: note.articleId, in: db),
              try !isDeleted(id: note.articleId, in: db) else { throw NativeAnnotationError.noteUnavailable }
        try recoverAnnotation(note, kind: "note", id: id, articleId: note.articleId, reason: "local-edit", in: db)
        note.content = content; note.updatedAt = Date(); try note.update(db)
        if annotationSyncEnabled {
            try enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.update", articleId: note.articleId, patch: NativeLibraryPatch(content: content), noteId: id), localID: note.articleId, in: db)
        }
    }
    public func deleteNote(id: String) throws {
        try database.write { db in
            guard let note = try LibraryNote.fetchOne(db, key: id), try !annotationDeleted(kind: "note", id: id, articleId: note.articleId, in: db) else { return }
            try tombstoneAnnotation(kind: "note", id: id, articleId: note.articleId, reason: "local-delete", in: db)
            if annotationSyncEnabled, try !isDeleted(id: note.articleId, in: db) {
                try enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.delete", articleId: note.articleId, noteId: id), localID: note.articleId, in: db)
            }
        }
    }

    static func validateNoteContent(_ content: String) throws {
        guard !content.contains("\0") else { throw NativeAnnotationError.invalidNoteContent }
    }

    func requireAnnotationArticle(_ id: String, in db: Database) throws {
        guard try Article.fetchOne(db, key: id) != nil, try !isDeleted(id: id, in: db) else { throw HighlightError.invalidSelection }
    }
    func annotationDeleted(kind: String, id: String, articleId: String, in db: Database) throws -> Bool {
        if try annotationPermanentlyDeleted(kind: kind, id: id, in: db) { return true }
        let parent = try annotationParentID(articleId, in: db)
        return try Bool.fetchOne(db, sql: "SELECT deleted FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, parent]) ?? false
    }
    func annotationPermanentlyDeleted(kind: String, id: String, in db: Database) throws -> Bool {
        try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM native_annotation_permanent WHERE kind = ? AND id = ?)", arguments: [kind, id.lowercased()]) ?? false
    }

    func recordPermanentAnnotationDeletion(kind: String, id: String, revision: String?, in db: Database) throws {
        let key = id.lowercased()
        try db.execute(sql: "DELETE FROM native_annotation_deferred WHERE kind = ? AND lower(id) = ?", arguments: [kind, key])
        let previous = try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_permanent WHERE kind = ? AND id = ?", arguments: [kind, key])
        let watermark = [previous, revision].compactMap { $0 }.max { Self.compareAnnotationRevision($0, $1) < 0 }
        try db.execute(sql: "INSERT INTO native_annotation_permanent(kind, id, revision) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET revision = excluded.revision", arguments: [kind, key, watermark])
        if kind == "note", let note = try LibraryNote.fetchOne(db, sql: "SELECT * FROM library_note WHERE lower(id) = ?", arguments: [key]) {
            try recoverAnnotation(note, kind: kind, id: note.id, articleId: note.articleId, reason: "permanent-delete", in: db)
            try setAnnotationState(kind: kind, id: note.id, articleId: note.articleId, deleted: true, in: db)
        }
        if kind == "highlight", let highlight = try Highlight.fetchOne(db, sql: "SELECT * FROM highlight WHERE lower(id) = ?", arguments: [key]) {
            try recoverAnnotation(highlight, kind: kind, id: highlight.id, articleId: highlight.articleId, reason: "permanent-delete", in: db)
            try setAnnotationState(kind: kind, id: highlight.id, articleId: highlight.articleId, deleted: true, in: db)
            // A cached attachment is not proof that the note itself was physically deleted:
            // a newer owned snapshot may have detached or moved it before the highlight died.
            for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE lower(highlightId) = ?", arguments: [key]) {
                try recoverAnnotation(note, kind: "note", id: note.id, articleId: note.articleId, reason: "permanent-parent-delete", in: db)
            }
        }
        try db.execute(sql: "UPDATE native_annotation_state SET deleted = 1, serverLive = 0 WHERE kind = ? AND lower(id) = ?", arguments: [kind, key])
    }

    func setAnnotationState(kind: String, id: String, articleId: String, deleted: Bool, revision: String? = nil, in db: Database) throws {
        if let revision, let existing = try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId]), Self.compareAnnotationRevision(revision, existing) < 0 { return }
        // A child tombstone is scoped to its parent and observed revision. A newer verified
        // live relationship can return to this parent; offline assignments cannot clear it.
        try db.execute(sql: "INSERT INTO native_annotation_state(kind, id, articleId, deleted, revision) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id, articleId) DO UPDATE SET deleted = MAX(deleted, excluded.deleted), present = 1, revision = COALESCE(excluded.revision, revision)", arguments: [kind, id, articleId, deleted, revision])
    }

    nonisolated static func compareAnnotationRevision(_ lhs: String, _ rhs: String) -> Int {
        let left = String(lhs.drop(while: { $0 == "0" })), right = String(rhs.drop(while: { $0 == "0" }))
        if left.count != right.count { return left.count < right.count ? -1 : 1 }
        return left == right ? 0 : (left < right ? -1 : 1)
    }

    func acceptLiveAnnotation(kind: String, id: String, articleId: String, revision: String, in db: Database) throws -> Bool {
        guard try !annotationPermanentlyDeleted(kind: kind, id: id, in: db) else { return false }
        let states = try NativeAnnotationState.fetchAll(db, sql: "SELECT * FROM native_annotation_state WHERE kind = ? AND id = ?", arguments: [kind, id])
        // Revisions are compared within a parent context. An old parent's unrelated
        // edits can advance its snapshot while the live child stays unchanged under B.
        if let previous = states.first(where: { $0.articleId == articleId })?.revision,
           Self.compareAnnotationRevision(revision, previous) < 0 { return false }
        let pendingDelete = try pendingAnnotationDelete(kind: kind, id: id, articleId: articleId, in: db)
        if let state = states.first(where: { $0.articleId == articleId }), state.deleted, !pendingDelete {
            if let previousRevision = state.revision {
                guard Self.compareAnnotationRevision(revision, previousRevision) > 0 else { return false }
            } else {
                // Local-only deletion/legacy state has no server watermark. Only an observed
                // move from another parent can establish a new relationship in that case.
                let previousParent = kind == "note" ? try LibraryNote.fetchOne(db, key: id)?.articleId : try Highlight.fetchOne(db, key: id)?.articleId
                guard let previousParent, previousParent != articleId else { return false }
            }
        }
        let storedParent = kind == "note" ? try LibraryNote.fetchOne(db, key: id)?.articleId : try Highlight.fetchOne(db, key: id)?.articleId
        let previousParent = try storedParent.map { try annotationParentID($0, in: db) }
        let previousGeneration = states.first(where: { $0.articleId == articleId })?.generation ?? 0
        let generation = previousGeneration + (previousParent != nil && previousParent != articleId ? 1 : 0)
        try db.execute(sql: "INSERT INTO native_annotation_state(kind, id, articleId, deleted, present, revision, serverLive, generation) VALUES (?, ?, ?, ?, 1, ?, 1, ?) ON CONFLICT(kind, id, articleId) DO UPDATE SET deleted = excluded.deleted, present = 1, revision = excluded.revision, serverLive = 1, generation = excluded.generation", arguments: [kind, id, articleId, pendingDelete, revision, generation])
        return true
    }
    func recordAppliedAnnotationEffect(kind: String, id: String, articleId: String, revision: String, in db: Database) throws {
        guard try !annotationPermanentlyDeleted(kind: kind, id: id, in: db) else { return }
        if let existing = try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId]), Self.compareAnnotationRevision(revision, existing) < 0 { return }
        let pendingDelete = try pendingAnnotationDelete(kind: kind, id: id, articleId: articleId, in: db)
        // A successful effect is a live server observation, independent of pull pagination.
        try db.execute(sql: "INSERT INTO native_annotation_state(kind, id, articleId, deleted, present, revision, serverLive) VALUES (?, ?, ?, ?, 1, ?, 1) ON CONFLICT(kind, id, articleId) DO UPDATE SET deleted = excluded.deleted, present = 1, revision = excluded.revision, serverLive = 1", arguments: [kind, id, articleId, pendingDelete, revision])
    }

    func rebaseAssignmentAfterStaleReceipt(_ item: NativeLibraryPending, effectRevision: String, in db: Database) throws {
        guard !item.mutation.kind.hasSuffix(".delete"), let id = item.mutation.annotationID else { return }
        let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
        guard try !annotationPermanentlyDeleted(kind: kind, id: id, in: db) else { return }
        let currentParent = kind == "note" ? try LibraryNote.fetchOne(db, key: id)?.articleId : try Highlight.fetchOne(db, key: id)?.articleId
        guard let currentParent,
              let live = try NativeAnnotationState.fetchOne(db, sql: "SELECT * FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, currentParent]),
              live.serverLive == true, !live.deleted, let liveRevision = live.revision,
              Self.compareAnnotationRevision(liveRevision, effectRevision) > 0 else { return }
        // An observed move already rebases frozen work. A newer local edit also wins;
        // never append the old assignment after either one.
        guard try !pending(in: db).contains(where: { $0.mutation.annotationID == id && $0.mutation.kind.hasPrefix(kind + ".") }) else { return }
        let patch = kind == "note" ? NativeLibraryPatch(content: item.mutation.patch?.content ?? item.mutation.content) : NativeLibraryPatch(color: item.mutation.patch?.color ?? item.mutation.color)
        let target = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [currentParent]) ?? ensureMapping(id: currentParent, in: db)
        try enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: kind + ".update", articleId: target, patch: patch,
            noteId: kind == "note" ? id : nil, highlightId: kind == "highlight" ? id : nil), localID: currentParent, in: db)
    }

    func reconcileAnnotationDeleteOverlay(kind: String, id: String, articleId: String, in db: Database) throws {
        guard try !annotationPermanentlyDeleted(kind: kind, id: id, in: db) else { return }
        let pendingDelete = try pendingAnnotationDelete(kind: kind, id: id, articleId: articleId, in: db)
        if !pendingDelete {
            try db.execute(sql: "UPDATE native_annotation_state SET deleted = 0 WHERE kind = ? AND id = ? AND articleId = ? AND serverLive = 1", arguments: [kind, id, articleId])
            if kind == "highlight", try !annotationDeleted(kind: kind, id: id, articleId: articleId, in: db) {
                for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE highlightId = ? AND articleId = ?", arguments: [id, articleId]) {
                    try reconcileAnnotationDeleteOverlay(kind: "note", id: note.id, articleId: articleId, in: db)
                }
            }
        }
    }

    @discardableResult func markAnnotationImport(kind: String, legacyID: String, annotationID: String, in db: Database) throws -> Bool {
        try db.execute(sql: "INSERT OR IGNORE INTO native_annotation_import VALUES (?, ?, ?)", arguments: [kind, legacyID, annotationID])
        return db.changesCount > 0
    }
    func originalSource(_ highlight: Highlight) -> NativeAnnotationSourceAnchor {
        NativeAnnotationSourceAnchor(space: "local-text-v1", text: highlight.text, startOffset: highlight.startOffset, endOffset: highlight.endOffset, contextPrefix: highlight.contextPrefix, contextSuffix: highlight.contextSuffix, contentHash: highlight.anchorContentHash)
    }
    func enqueueHighlightCreate(_ highlight: Highlight, in db: Database) throws {
        try enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "highlight.create", articleId: highlight.articleId, highlightId: highlight.id, color: highlight.color, sourceAnchor: highlight.sourceAnchor ?? originalSource(highlight)), localID: highlight.articleId, in: db)
    }
    func enqueueNoteCreate(_ note: LibraryNote, in db: Database) throws {
        try enqueueAnnotation(NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: "note.create", articleId: note.articleId, noteId: note.id, highlightId: note.highlightId, content: note.content), localID: note.articleId, in: db)
    }
    func enqueueAnnotation(_ mutation: NativeLibraryMutation, localID: String, in db: Database) throws {
        let parent = try annotationParentID(localID, in: db)
        _ = try ensureMapping(id: parent, in: db)
        var mutation = mutation
        mutation.articleId = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [parent]) ?? mutation.articleId
        try enqueue(mutation, localID: parent, in: db)
    }
    func recoverAnnotation<T: Encodable>(_ value: T, kind: String, id: String, articleId: String, reason: String, in db: Database) throws {
        let payload = String(decoding: try NativeLibraryWire.encoder().encode(value), as: UTF8.self)
        // Identical retries and repeated snapshots do not grow recovery storage.
        guard try !Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM native_annotation_recovery WHERE kind = ? AND annotationID = ? AND payload = ? AND reason = ?)", arguments: [kind, id, payload, reason])! else { return }
        try db.execute(sql: "INSERT INTO native_annotation_recovery VALUES (?, ?, ?, ?, ?, ?, ?)", arguments: [UUID().uuidString.lowercased(), kind, id, articleId, payload, Date(), reason])
    }
    func tombstoneAnnotation(kind: String, id: String, articleId: String, reason: String, revision: String? = nil, cascade: Bool = true, in db: Database) throws {
        if let revision, let existing = try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId]), Self.compareAnnotationRevision(revision, existing) < 0 { return }
        try setAnnotationState(kind: kind, id: id, articleId: articleId, deleted: true, revision: revision, in: db)
        if revision != nil || reason == "server-delete" {
            try db.execute(sql: "UPDATE native_annotation_state SET serverLive = 0 WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId])
        }
        if kind == "note", let note = try LibraryNote.fetchOne(db, key: id), note.articleId == articleId {
            try recoverAnnotation(note, kind: kind, id: id, articleId: articleId, reason: reason, in: db)
        }
        if kind == "highlight", let highlight = try Highlight.fetchOne(db, key: id), highlight.articleId == articleId {
            try recoverAnnotation(highlight, kind: kind, id: id, articleId: articleId, reason: reason, in: db)
            if cascade {
                for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE highlightId = ? AND articleId = ?", arguments: [id, articleId]) {
                    try tombstoneAnnotation(kind: "note", id: note.id, articleId: articleId, reason: reason, revision: revision, in: db)
                }
            }
        }
    }
    func retainArticleAnnotations(id: String, in db: Database) throws {
        for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE articleId = ?", arguments: [id]) {
            try recoverAnnotation(note, kind: "note", id: note.id, articleId: id, reason: "article-delete", in: db)
            if annotationSyncEnabled { try tombstoneAnnotation(kind: "note", id: note.id, articleId: id, reason: "article-delete", in: db) }
        }
        for highlight in try Highlight.fetchAll(db, sql: "SELECT * FROM highlight WHERE articleId = ?", arguments: [id]) {
            try recoverAnnotation(highlight, kind: "highlight", id: highlight.id, articleId: id, reason: "article-delete", in: db)
            if annotationSyncEnabled { try tombstoneAnnotation(kind: "highlight", id: highlight.id, articleId: id, reason: "article-delete", in: db) }
        }
    }

}
