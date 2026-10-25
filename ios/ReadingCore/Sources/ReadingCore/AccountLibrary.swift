import Foundation

@MainActor public enum AccountLibrary {
    /// Back up a closed legacy library once; never copy live SQLite/WAL files by hand.
    public static func open(root: URL, namespace: String) throws -> Library {
        guard namespace.count == 64, namespace.allSatisfy({ $0.isHexDigit }) else { throw NativeAuthError.invalidResponse }
        let manager = FileManager.default
        let folder = root.appendingPathComponent("Accounts", isDirectory: true).appendingPathComponent(namespace, isDirectory: true)
        try manager.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent("library.sqlite")
        let legacy = root.appendingPathComponent("library.sqlite")
        let claim = root.appendingPathComponent("legacy-account-owner")
        // An unreadable/corrupt claim must never be treated as an unclaimed library.
        let owner = manager.fileExists(atPath: claim.path) ? try String(contentsOf: claim, encoding: .utf8) : nil
        if let owner, (owner.count != 64 || !owner.allSatisfy({ $0.isHexDigit })) { throw NativeAuthError.invalidResponse }
        if owner == nil { try Data(namespace.utf8).write(to: claim, options: [.atomic]) }
        if !manager.fileExists(atPath: destination.path), manager.fileExists(atPath: legacy.path) {
            if owner == nil || owner == namespace {
                // Claim before starting the import, so a failed import cannot move to B.
                let source = try Library(path: legacy.path)
                let staging = folder.appendingPathComponent("import-\(UUID().uuidString).sqlite")
                defer { try? manager.removeItem(at: staging) }
                try source.backup(to: staging.path)
                try manager.moveItem(at: staging, to: destination)
                for article in try source.articles() {
                    let oldKey = "speech-bookmark-" + article.id
                    if let data = UserDefaults.standard.data(forKey: oldKey) {
                        UserDefaults.standard.set(data, forKey: "speech-bookmark-\(namespace):\(article.id)")
                    }
                }
            }
        }
        return try Library(path: destination.path)
    }
}
