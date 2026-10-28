import Foundation

struct ShareDestination: Codable, Equatable, Sendable {
    let namespace: String
    let generation: String
    let expiresAt: Date
}

enum ShareInboxError: LocalizedError, Equatable {
    case unavailable
    var errorDescription: String? {
        "Safari sharing isn’t available in this install. You can still save links in Paper Drive."
    }
}

enum ShareInbox {
    private static func root() throws -> URL {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "ReadingAppGroup") as? String, !group.isEmpty,
              !group.hasPrefix("$("),
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw ShareInboxError.unavailable
        }
        return container
    }
    static func directory(namespace: String) throws -> URL {
        guard namespace.count == 64, namespace.allSatisfy({ $0.isHexDigit }) else { throw NativeInboxError.signedOut }
        let folder = try root().appendingPathComponent("Inbox", isDirectory: true).appendingPathComponent(namespace, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
    static func destination() throws -> ShareDestination? {
        let path = try root().appendingPathComponent("ShareDestination.json")
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        let value = try JSONDecoder().decode(ShareDestination.self, from: Data(contentsOf: path))
        return value.expiresAt > Date() ? value : nil
    }
    static func setDestination(_ value: ShareDestination?) throws {
        let path = try root().appendingPathComponent("ShareDestination.json")
        if let value {
            try JSONEncoder().encode(value).write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } else if FileManager.default.fileExists(atPath: path.path) { try FileManager.default.removeItem(at: path) }
    }
    static func save(_ url: URL, destination expected: ShareDestination) throws {
        guard try destination() == expected else { throw NativeInboxError.signedOut }
        let file = try directory(namespace: expected.namespace).appendingPathComponent(UUID().uuidString).appendingPathExtension("json")
        try JSONEncoder().encode(url.absoluteString).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func adoptLegacy(namespace: String) throws {
        let original = try root().appendingPathComponent("Inbox", isDirectory: true)
        guard FileManager.default.fileExists(atPath: original.path) else { return }
        let target = try directory(namespace: namespace)
        for file in try FileManager.default.contentsOfDirectory(at: original, includingPropertiesForKeys: [.isRegularFileKey]) where file.pathExtension == "json" {
            guard try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { continue }
            try FileManager.default.moveItem(at: file, to: target.appendingPathComponent(file.lastPathComponent))
        }
    }
}

enum NativeInboxError: LocalizedError {
    case signedOut
    var errorDescription: String? { "Open Paper Drive and sign in, then share the article again." }
}
