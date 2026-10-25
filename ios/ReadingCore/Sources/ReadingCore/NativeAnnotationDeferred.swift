import Foundation
import GRDB

struct NativeAnnotationDeferred: FetchableRecord {
    let kind: String
    let id: String
    let sequence: Int64
    let mutation: NativeLibraryMutation
    init(row: Row) throws {
        kind = row["kind"]; id = row["id"]; sequence = row["sequence"]
        let payload: Data = row["payload"]
        mutation = try NativeLibraryWire.decoder().decode(NativeLibraryMutation.self, from: payload)
    }
}

extension Library {
    func annotationAssignments(in db: Database) throws -> [NativeLibraryMutation] {
        let queued = try pending(in: db).filter { $0.mutation.isAnnotation }.map { ($0.sequence, $0.mutation) }
        let deferred = try NativeAnnotationDeferred.fetchAll(db, sql: "SELECT * FROM native_annotation_deferred").map { ($0.sequence, $0.mutation) }
        return (queued + deferred).sorted { $0.0 < $1.0 }.map { $0.1 }
    }

    func deferAnnotationAssignment(_ item: NativeLibraryPending, in db: Database) throws {
        guard !item.mutation.kind.hasSuffix(".delete"), let id = item.mutation.annotationID else { return }
        let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
        guard try !annotationPermanentlyDeleted(kind: kind, id: id, in: db) else { return }
        let patch = kind == "note" ? NativeLibraryPatch(content: item.mutation.patch?.content ?? item.mutation.content) : NativeLibraryPatch(color: item.mutation.patch?.color ?? item.mutation.color)
        let replacement = NativeLibraryMutation(mutationId: UUID().uuidString.lowercased(), kind: kind + ".update", articleId: item.mutation.articleId, patch: patch,
            noteId: kind == "note" ? id : nil, highlightId: kind == "highlight" ? id : nil)
        let payload = try NativeLibraryWire.encoder().encode(replacement)
        try db.execute(sql: """
            INSERT INTO native_annotation_deferred(kind, id, sequence, payload) VALUES (?, ?, ?, ?)
            ON CONFLICT(kind, id) DO UPDATE SET sequence = excluded.sequence, payload = excluded.payload
            WHERE excluded.sequence > sequence
            """, arguments: [kind, id, item.sequence, payload])
    }

    func routeDeferredAnnotation(kind: String, id: String, in db: Database) throws {
        guard let item = try NativeAnnotationDeferred.fetchOne(db, sql: "SELECT * FROM native_annotation_deferred WHERE kind = ? AND id = ?", arguments: [kind, id]) else { return }
        if try annotationPermanentlyDeleted(kind: kind, id: id, in: db) {
            try db.execute(sql: "DELETE FROM native_annotation_deferred WHERE kind = ? AND id = ?", arguments: [kind, id]); return
        }
        let storedParent = kind == "note" ? try LibraryNote.fetchOne(db, key: id)?.articleId : try Highlight.fetchOne(db, key: id)?.articleId
        guard let storedParent else { return }
        let parent = try annotationParentID(storedParent, in: db)
        guard try !isDeleted(id: parent, in: db),
              let live = try NativeAnnotationState.fetchOne(db, sql: "SELECT * FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, parent]),
              live.serverLive == true, !live.deleted else { return }
        let newer = try pending(in: db).contains { $0.sequence > item.sequence && $0.mutation.annotationID == id && $0.mutation.kind.hasPrefix(kind + ".") }
        if !newer {
            var mutation = item.mutation
            mutation.articleId = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [parent]) ?? ensureMapping(id: parent, in: db)
            try enqueueAnnotation(mutation, localID: parent, in: db)
        }
        try db.execute(sql: "DELETE FROM native_annotation_deferred WHERE kind = ? AND id = ?", arguments: [kind, id])
    }
}
