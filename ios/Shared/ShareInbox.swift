import Foundation

enum ShareInbox {
    static func directory() throws -> URL {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "ReadingAppGroup") as? String,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "ReadItLater", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group is unavailable. Enable the same App Group for the app and Share Extension in Xcode."])
        }
        let directory = container.appendingPathComponent("Inbox", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    static func save(_ url: URL) throws {
        let file = try directory().appendingPathComponent(UUID().uuidString).appendingPathExtension("json")
        try JSONEncoder().encode(url.absoluteString).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
