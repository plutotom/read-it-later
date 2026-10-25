import Foundation
import GRDB

extension Library {
    func applyAnnotations(_ snapshot: NativeAnnotationSnapshot, article: NativeLibraryArticle, localID: String, revision: String, in db: Database) throws {
        guard snapshot.complete else {
            try db.execute(sql: "UPDATE article SET error = ? WHERE id = ?", arguments: [NativeLibraryError.annotationLimit.errorDescription, localID])
            return
        }
        let highlights = try (snapshot.highlights ?? []).map { remote in
            var value = remote
            value.id = try annotationLocalID(kind: "highlight", id: remote.id, in: db)
            return value
        }
        let notes = try (snapshot.notes ?? []).map { remote in
            var value = remote
            value.id = try annotationLocalID(kind: "note", id: remote.id, in: db)
            if let highlightID = value.highlightId { value.highlightId = try annotationLocalID(kind: "highlight", id: highlightID, in: db) }
            return value
        }
        let acceptedHighlights = try Set(highlights.filter { try acceptLiveAnnotation(kind: "highlight", id: $0.id, articleId: localID, revision: revision, in: db) }.map(\.id))
        let acceptedNotes = try Set(notes.filter { try acceptLiveAnnotation(kind: "note", id: $0.id, articleId: localID, revision: revision, in: db) }.map(\.id))
        // Retarget only assignments that have never been sent. Frozen requests retain their
        // original parent and receipt identity; a separate latest assignment follows the move.
        for highlight in highlights where acceptedHighlights.contains(highlight.id) { try reparentPendingAnnotation(kind: "highlight", id: highlight.id, articleId: localID, in: db) }
        for note in notes where acceptedNotes.contains(note.id) { try reparentPendingAnnotation(kind: "note", id: note.id, articleId: localID, in: db) }
        let pending = try annotationAssignments(in: db)
        for deletion in snapshot.deleted ?? [] {
            try tombstoneAnnotation(kind: deletion.kind, id: annotationLocalID(kind: deletion.kind, id: deletion.id, in: db), articleId: localID, reason: "server-delete", revision: revision, in: db)
        }
        // A complete collection hides absent rows, but absence alone is not a permanent identity tombstone:
        // an owned relationship can move between articles without deleting the annotation.
        for note in try LibraryNote.fetchAll(db, sql: "SELECT * FROM library_note WHERE articleId = ?", arguments: [localID]) where !notes.contains(where: { $0.id == note.id }) {
            if pending.contains(where: { $0.kind == "note.create" && $0.noteId == note.id }) { continue }
            try recoverAnnotation(note, kind: "note", id: note.id, articleId: localID, reason: "snapshot-absence", in: db)
            try hideAnnotation(kind: "note", id: note.id, articleId: localID, revision: revision, in: db)
        }
        for highlight in try Highlight.fetchAll(db, sql: "SELECT * FROM highlight WHERE articleId = ?", arguments: [localID]) where !highlights.contains(where: { $0.id == highlight.id }) {
            if pending.contains(where: { $0.kind == "highlight.create" && $0.highlightId == highlight.id }) { continue }
            try recoverAnnotation(highlight, kind: "highlight", id: highlight.id, articleId: localID, reason: "snapshot-absence", in: db)
            try hideAnnotation(kind: "highlight", id: highlight.id, articleId: localID, revision: revision, in: db)
        }
        for remote in highlights {
            guard acceptedHighlights.contains(remote.id) else { continue }
            let source = remote.sourceAnchor
            var highlight = Highlight(id: remote.id, articleId: localID, text: source.text, startOffset: source.startOffset, endOffset: source.endOffset,
                contextPrefix: source.contextPrefix, contextSuffix: source.contextSuffix, anchorContentHash: source.contentHash,
                color: remote.color, createdAt: remote.createdAt, version: 1,
                sourceAnchor: source, canonicalAnchor: remote.validatedCanonicalAnchor(article: article), resolution: remote.validatedCanonicalAnchor(article: article) == nil ? "unresolved" : "anchored", updatedAt: remote.updatedAt)
            if let old = try Highlight.fetchOne(db, key: remote.id) {
                try recoverAnnotation(old, kind: "highlight", id: old.id, articleId: old.articleId, reason: "server-replacement", in: db)
            }
            for mutation in pending where mutation.highlightId == remote.id && mutation.kind.hasPrefix("highlight.") {
                if mutation.kind == "highlight.update", let color = mutation.patch?.color { highlight.color = color }
                if mutation.kind == "highlight.create", let color = mutation.color { highlight.color = color }
            }
            try setAnnotationState(kind: "highlight", id: highlight.id, articleId: localID, deleted: false, in: db)
            try highlight.save(db)
            try routeDeferredAnnotation(kind: "highlight", id: highlight.id, in: db)
            _ = try markAnnotationImport(kind: "highlight", legacyID: highlight.id, annotationID: highlight.id, in: db)
        }
        for var note in notes {
            guard acceptedNotes.contains(note.id) else { continue }
            if let highlightID = note.highlightId, try annotationDeleted(kind: "highlight", id: highlightID, articleId: localID, in: db) {
                let serverLive = try Bool.fetchOne(db, sql: "SELECT serverLive FROM native_annotation_state WHERE kind = 'highlight' AND id = ? AND articleId = ?", arguments: [highlightID, localID]) ?? false
                // A pending local highlight delete hides attached notes through their parent;
                // it must not turn a newer verified live note into a physical server tombstone.
                if !serverLive {
                    try tombstoneAnnotation(kind: "note", id: note.id, articleId: localID, reason: "server-delete", revision: revision, in: db)
                    continue
                }
            }
            if let old = try LibraryNote.fetchOne(db, key: note.id) {
                try recoverAnnotation(old, kind: "note", id: old.id, articleId: old.articleId, reason: "server-replacement", in: db)
            }
            note.articleId = localID
            for mutation in pending where mutation.noteId == note.id {
                if mutation.kind == "note.update", let content = mutation.patch?.content { note.content = content }
                if mutation.kind == "note.create", let content = mutation.content { note.content = content }
            }
            try setAnnotationState(kind: "note", id: note.id, articleId: localID, deleted: false, in: db)
            try note.save(db)
            try routeDeferredAnnotation(kind: "note", id: note.id, in: db)
            _ = try markAnnotationImport(kind: "note", legacyID: note.id, annotationID: note.id, in: db)
        }
    }

    private func reparentPendingAnnotation(kind: String, id: String, articleId: String, in db: Database) throws {
        let previousParent: String?
        if kind == "note" { previousParent = try LibraryNote.fetchOne(db, key: id)?.articleId }
        else { previousParent = try Highlight.fetchOne(db, key: id)?.articleId }
        guard let previousParent, try annotationParentID(previousParent, in: db) != annotationParentID(articleId, in: db) else { return }
        let assignments = try pending(in: db).filter {
            $0.mutation.annotationID == id && $0.mutation.kind.hasPrefix(kind + ".") && !$0.mutation.kind.hasSuffix(".delete")
        }
        let target = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [articleId]) ?? ensureMapping(id: articleId, in: db)
        for item in assignments where !item.frozen {
            var mutation = item.mutation
            mutation.articleId = target
            let payload = try NativeLibraryWire.encoder().encode(mutation)
            try db.execute(sql: "UPDATE native_pending SET localID = ?, payload = ? WHERE sequence = ? AND mutationID = ? AND frozen = 0", arguments: [articleId, payload, item.sequence, mutation.mutationId])
        }
        // Do not let rebasing an older frozen assignment overwrite a newer queued edit.
        if let latest = assignments.last, latest.frozen {
            let patch = kind == "note" ? NativeLibraryPatch(content: latest.mutation.patch?.content ?? latest.mutation.content) : NativeLibraryPatch(color: latest.mutation.patch?.color ?? latest.mutation.color)
            let mutation = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: kind + ".update", articleId: target, patch: patch,
                noteId: kind == "note" ? id : nil, highlightId: kind == "highlight" ? id : nil)
            try enqueueAnnotation(mutation, localID: articleId, in: db)
        }
    }

    private func annotationLocalID(kind: String, id: String, in db: Database) throws -> String {
        if kind == "highlight" { return try String.fetchOne(db, sql: "SELECT id FROM highlight WHERE lower(id) = lower(?)", arguments: [id]) ?? id }
        return try String.fetchOne(db, sql: "SELECT id FROM library_note WHERE lower(id) = lower(?)", arguments: [id]) ?? id
    }

    private func hideAnnotation(kind: String, id: String, articleId: String, revision: String, in db: Database) throws {
        if let existing = try String.fetchOne(db, sql: "SELECT revision FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, articleId]), Self.compareAnnotationRevision(revision, existing) < 0 { return }
        try db.execute(sql: "INSERT INTO native_annotation_state(kind, id, articleId, present, revision) VALUES (?, ?, ?, 0, ?) ON CONFLICT(kind, id, articleId) DO UPDATE SET present = 0, revision = excluded.revision, serverLive = 0", arguments: [kind, id, articleId, revision])
    }
}
