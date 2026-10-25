import Foundation
import GRDB

extension Library {
    /// Annotation relationships use one persisted local representative for a server article.
    /// Reader article IDs and their text/snapshot histories remain independent.
    func annotationParentID(_ localID: String, in db: Database) throws -> String {
        guard let serverID = try String.fetchOne(db, sql: "SELECT serverID FROM native_mapping WHERE localID = ?", arguments: [localID]) else { return localID }
        return try String.fetchOne(db, sql: "SELECT localID FROM native_annotation_parent WHERE serverID = ?", arguments: [serverID]) ?? localID
    }

    nonisolated static func canonicalizeAnnotationAliases(serverID: String, in db: Database) throws -> String? {
        let aliases = try String.fetchAll(db, sql: "SELECT localID FROM native_mapping WHERE serverID = ? ORDER BY localID", arguments: [serverID])
        guard let first = aliases.first else { return nil }
        let saved = try String.fetchOne(db, sql: "SELECT localID FROM native_annotation_parent WHERE serverID = ?", arguments: [serverID])
        let existing = try String.fetchOne(db, sql: """
            SELECT articleId FROM (
                SELECT n.articleId, n.createdAt, n.id FROM library_note n JOIN native_mapping m ON m.localID = n.articleId WHERE m.serverID = ?
                UNION ALL
                SELECT h.articleId, h.createdAt, h.id FROM highlight h JOIN native_mapping m ON m.localID = h.articleId WHERE m.serverID = ?
            ) ORDER BY createdAt, id, articleId LIMIT 1
            """, arguments: [serverID, serverID])
        let canonical = saved.flatMap { aliases.contains($0) ? $0 : nil } ?? existing ?? first
        try db.execute(sql: "INSERT INTO native_annotation_parent(serverID, localID) VALUES (?, ?) ON CONFLICT(serverID) DO UPDATE SET localID = excluded.localID", arguments: [serverID, canonical])
        for alias in aliases where alias != canonical {
            for source in try NativeAnnotationState.fetchAll(db, sql: "SELECT * FROM native_annotation_state WHERE articleId = ?", arguments: [alias]) {
                let target = try NativeAnnotationState.fetchOne(db, sql: "SELECT * FROM native_annotation_state WHERE kind = ? AND id = ? AND articleId = ?", arguments: [source.kind, source.id, canonical])
                let useSource: Bool
                if let target {
                    if let a = source.revision, let b = target.revision { useSource = compareAnnotationRevision(a, b) > 0 }
                    else { useSource = source.revision != nil && target.revision == nil }
                } else { useSource = true }
                if useSource {
                    try db.execute(sql: """
                        INSERT INTO native_annotation_state(kind, id, articleId, deleted, present, revision, serverLive, generation)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(kind, id, articleId) DO UPDATE SET deleted = excluded.deleted, present = excluded.present,
                            revision = excluded.revision, serverLive = excluded.serverLive, generation = excluded.generation
                        """, arguments: [source.kind, source.id, canonical, source.deleted, source.present, source.revision, source.serverLive ?? false, target?.generation ?? source.generation ?? 0])
                }
            }
            try db.execute(sql: "UPDATE library_note SET articleId = ? WHERE articleId = ?", arguments: [canonical, alias])
            try db.execute(sql: "UPDATE highlight SET articleId = ? WHERE articleId = ?", arguments: [canonical, alias])
            for item in try NativeLibraryPending.fetchAll(db, sql: "SELECT * FROM native_pending WHERE localID = ? AND frozen = 0 ORDER BY sequence", arguments: [alias]) where item.mutation.isAnnotation {
                var mutation = item.mutation
                mutation.articleId = serverID
                let payload = try NativeLibraryWire.encoder().encode(mutation)
                try db.execute(sql: "UPDATE native_pending SET localID = ?, payload = ? WHERE sequence = ? AND frozen = 0", arguments: [canonical, payload, item.sequence])
            }
        }
        // Frozen deletes keep their exact original request/context. Their local overlay
        // nevertheless applies to every alias of the same owned server parent.
        let deletes = try NativeLibraryPending.fetchAll(db, sql: "SELECT p.* FROM native_pending p JOIN native_mapping m ON m.localID = p.localID WHERE m.serverID = ? ORDER BY p.sequence", arguments: [serverID])
        for item in deletes where item.mutation.isAnnotation && item.mutation.kind.hasSuffix(".delete") {
            if let id = item.mutation.annotationID {
                let kind = item.mutation.kind.hasPrefix("note.") ? "note" : "highlight"
                try db.execute(sql: "UPDATE native_annotation_state SET deleted = 1 WHERE kind = ? AND id = ? AND articleId = ?", arguments: [kind, id, canonical])
            }
        }
        return canonical
    }

    func pendingAnnotationDelete(kind: String, id: String, articleId: String, in db: Database) throws -> Bool {
        let canonical = try annotationParentID(articleId, in: db)
        for item in try pending(in: db) where item.mutation.kind == kind + ".delete" && item.mutation.annotationID == id {
            if try annotationParentID(item.localID, in: db) == canonical { return true }
        }
        return false
    }
}
