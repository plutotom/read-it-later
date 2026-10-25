import Foundation
import GRDB

extension Library {
    /// Await from launch/foreground/manual refresh and after local writes. The caller owns retry scheduling.
    /// Repeated concurrent calls never dispatch a second copy of the outbox.
    public func sync(session: NativeAuthSession, client: any NativeLibraryAPI = NativeLibraryClient()) async throws {
        guard syncEnabled else { throw NativeLibraryError.disabled }
        guard activeSync == nil else { throw NativeLibraryError.alreadySyncing }
        try Task.checkCancellation()
        try bindSync(session)
        syncEpoch &+= 1
        let epoch = syncEpoch
        let task = Task { @MainActor in try await self.runSync(session: session, client: client, epoch: epoch) }
        activeSync = task
        do {
            try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
            if epoch == syncEpoch { activeSync = nil }
        } catch {
            if epoch == syncEpoch {
                activeSync = nil
                // Persist only our fixed messages, never response bodies, URLs, text, or credentials.
                let message = error is CancellationError ? nil : (error as? NativeLibraryError ?? .unavailable).errorDescription
                try? recordSyncError(message)
            }
            throw error
        }
    }

    /// Call before switching account/server, signing out, or replacing the current account library.
    /// Epoch checks fence even a mock/noncooperating transport that returns after cancellation.
    public func cancelSync() {
        syncEpoch &+= 1
        activeSync?.cancel()
        activeSync = nil
    }

    private func checkSync(epoch: UInt64) throws {
        try Task.checkCancellation()
        guard epoch == syncEpoch else { throw CancellationError() }
    }

    private func runSync(session: NativeAuthSession, client: any NativeLibraryAPI, epoch: UInt64) async throws {
        try checkSync(epoch: epoch)
        let verified = try await client.verify(session)
        try checkSync(epoch: epoch)
        guard verified.user.id == session.user.id, verified.server == session.server,
              verified.expiresAt > Date(), verified.token == session.token else { throw NativeLibraryError.accountMismatch }
        // Drain in durable order. New edits arriving during a request are retained and sent in a later batch.
        while true {
            try checkSync(epoch: epoch)
            let batch = try prepareBatch()
            if batch.isEmpty { break }
            let acknowledgment = try await client.push(verified, mutations: batch.map(\.mutation))
            try checkSync(epoch: epoch)
            try acknowledge(acknowledgment, batch: batch)
        }
        var cursor = try syncCursor()
        var seen: Set<String> = []
        for _ in 0..<10_000 {
            try checkSync(epoch: epoch)
            let page = try await client.pull(verified, cursor: cursor)
            try checkSync(epoch: epoch)
            guard seen.insert(page.cursor).inserted || (!page.hasMore && page.changes.isEmpty && page.cursor == cursor) else {
                throw NativeLibraryError.invalidResponse
            }
            try apply(page, after: cursor)
            cursor = page.cursor
            if !page.hasMore {
                try recordSyncSuccess()
                if try hasQuarantinedMutations() { throw NativeLibraryError.tooLarge }
                return
            }
        }
        throw NativeLibraryError.invalidResponse
    }

    private func bindSync(_ session: NativeAuthSession) throws {
        try database.write { try bind(session, in: $0) }
    }

    private func recordSyncError(_ message: String?) throws {
        try database.write { try $0.execute(sql: "UPDATE native_sync_state SET lastError = ? WHERE singleton = 1", arguments: [message]) }
    }

    func syncCursor() throws -> String? {
        try database.read { try String.fetchOne($0, sql: "SELECT cursor FROM native_sync_state WHERE singleton = 1") }
    }

    private func recordSyncSuccess() throws {
        try database.write { try $0.execute(sql: "UPDATE native_sync_state SET lastSuccess = ?, lastError = NULL WHERE singleton = 1", arguments: [Date()]) }
    }
}
