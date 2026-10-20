import XCTest
@testable import ReadingCore

final class StorageTests: XCTestCase {
    func testChangingLimitImmediatelyTrimsLeastRecentlyUsedAudio() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = SpeechDiskCache(directory: root, limit: CacheLimit.unlimited.bytes)
        let voice = SpeechVoice(id: "fixture", name: "Test", language: "en")
        let requests = ["First.", "Second.", "Third."].map { SpeechRequest(text: $0, voice: voice, configurationID: "storage") }
        let response = SpeechResponse(audio: .encoded(Data(repeating: 0, count: 480), contentType: "audio/pcm"), duration: 0.01, marks: [])
        let now = Date()
        for (index, request) in requests.enumerated() {
            try await cache.put(response, for: request, now: now.addingTimeInterval(Double(index)))
        }
        let before = try await cache.stats(now: now.addingTimeInterval(3))
        _ = try await cache.get(requests[0], now: now.addingTimeInterval(4))
        try await cache.setLimit(before.bytes * 2 / 3, now: now.addingTimeInterval(5))
        let oldest = try await cache.get(requests[1], now: now.addingTimeInterval(6))
        let recent = try await cache.get(requests[0], now: now.addingTimeInterval(6))
        let newest = try await cache.get(requests[2], now: now.addingTimeInterval(6))
        XCTAssertNil(oldest); XCTAssertEqual(recent, response); XCTAssertEqual(newest, response)
        let after = try await cache.stats(now: now.addingTimeInterval(6))
        XCTAssertLessThanOrEqual(after.bytes, before.bytes * 2 / 3)
        XCTAssertEqual(after.chunks, 2)
        let reopened = SpeechDiskCache(directory: root, limit: before.bytes * 2 / 3)
        let persisted = try await reopened.stats(now: now.addingTimeInterval(7))
        XCTAssertEqual(persisted.bytes, after.bytes)
        try await cache.setLimit(0, now: now.addingTimeInterval(8))
        let empty = try await cache.stats(now: now.addingTimeInterval(8))
        XCTAssertEqual(empty.bytes, 0)
        try await cache.setLimit(CacheLimit.unlimited.bytes, now: now.addingTimeInterval(9))
        try await cache.put(response, for: requests[0], now: now.addingTimeInterval(10))
        let restored = try await cache.get(requests[0], now: now.addingTimeInterval(11))
        XCTAssertEqual(restored, response)
    }

    func testClearFencesLateWritesButAllowsNewDownloads() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = SpeechDiskCache(directory: root)
        let request = SpeechRequest(text: "Audio.", voice: SpeechVoice(id: "test", name: "", language: "en"), configurationID: "storage")
        let response = SpeechResponse(audio: .encoded(Data(repeating: 0, count: 480), contentType: "audio/pcm"), duration: 0.01, marks: [])
        let old = await cache.writeGeneration()
        try await cache.put(response, for: request, expectedGeneration: old)
        try await cache.clear()
        try await cache.put(response, for: request, expectedGeneration: old)
        let empty = try await cache.stats()
        XCTAssertEqual(empty.bytes, 0)
        let new = await cache.writeGeneration()
        XCTAssertNotEqual(old, new)
        try await cache.put(response, for: request, expectedGeneration: new)
        let replay = try await cache.get(request)
        XCTAssertEqual(replay, response)
    }

    @MainActor func testRemovingDownloadsPreservesLibraryAndAnnotationsAcrossRestart() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("library.sqlite").path
        let library = try Library(path: path)
        let article = try library.saveURL("https://example.com/retained")
        let text = "A saved quote 🌎 and a downloaded article."
        try library.saveContent(id: article.id, title: "Keep this title", text: text)
        try library.saveNote(id: article.id, text: "Keep this note")
        try library.toggleRead(id: article.id)
        try library.toggleFavorite(id: article.id)
        let highlight = try library.addHighlight(articleId: article.id, content: text, range: (text as NSString).range(of: "saved quote 🌎"))
        try library.removeDownloads()
        let reopened = try Library(path: path)
        let retained = try XCTUnwrap(reopened.articles().first)
        XCTAssertEqual(retained.id, article.id); XCTAssertEqual(retained.url, article.url)
        XCTAssertEqual(retained.title, "Keep this title"); XCTAssertEqual(retained.note, "Keep this note")
        XCTAssertTrue(retained.isRead); XCTAssertTrue(retained.isFavorite)
        XCTAssertFalse(retained.isDownloaded); XCTAssertTrue(retained.downloadSuppressed)
        let savedHighlight = try XCTUnwrap(reopened.highlights(articleId: article.id).first)
        XCTAssertEqual(savedHighlight.id, highlight.id); XCTAssertEqual(savedHighlight.text, highlight.text)
        XCTAssertNil(savedHighlight.range(in: retained.text))
        try reopened.saveContent(id: article.id, title: "Keep this title", text: text)
        let downloaded = try XCTUnwrap(reopened.articles().first)
        XCTAssertFalse(downloaded.downloadSuppressed)
        XCTAssertTrue(downloaded.isDownloaded)
        XCTAssertNotNil(savedHighlight.range(in: downloaded.text))
    }
}
