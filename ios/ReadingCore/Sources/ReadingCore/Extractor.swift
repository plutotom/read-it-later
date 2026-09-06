import Foundation
import SwiftSoup

public struct ExtractedArticle: Sendable {
    public let title: String
    public let text: String
}

/// Parses text only: no HTML is rendered and publisher scripts are never executed.
public enum Extractor {
    public static func parse(html: String) throws -> ExtractedArticle {
        let doc = try SwiftSoup.parse(html)
        try doc.select("script, style, nav, header, footer, aside, form, iframe, noscript, svg").remove()
        let root = try doc.select("article").first() ?? doc.select("main").first() ?? doc.body()
        guard let root else { throw LibraryError.noContent }
        let blocks = try root.select("h1, h2, h3, p, li, pre, blockquote").array()
        var paragraphs: [String] = []
        for block in blocks {
            // Avoid duplicating nested block text (e.g. a paragraph in a blockquote).
            if try !block.select("p, li, pre, blockquote").array().filter({ $0 !== block }).isEmpty { continue }
            let text = try block.text().trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { paragraphs.append(text) }
        }
        let text = paragraphs.isEmpty ? try root.text() : paragraphs.joined(separator: "\n\n")
        guard text.count >= 80 else { throw LibraryError.noContent }
        let title = try doc.title()
        return ExtractedArticle(title: title.isEmpty ? String(text.prefix(70)) : title, text: text)
    }
}

private final class RedirectGuard: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        guard let url = request.url, (try? ArticleURL.parse(url.absoluteString)) != nil,
              response.url?.scheme != "https" || url.scheme == "https" else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}

public enum ArticleDownloader {
    public static func download(url: URL) async throws -> ExtractedArticle {
        _ = try ArticleURL.parse(url.absoluteString)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 40
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        let session = URLSession(configuration: configuration, delegate: RedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url)
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse else { throw LibraryError.unsupported }
        guard (200..<300).contains(response.statusCode) else { throw LibraryError.http(response.statusCode) }
        guard ["text/html", "application/xhtml+xml"].contains(response.mimeType ?? "") else { throw LibraryError.unsupported }
        let limit = 5 * 1_024 * 1_024
        guard response.expectedContentLength <= limit else { throw LibraryError.tooLarge }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < limit else { throw LibraryError.tooLarge }
            data.append(byte)
        }
        guard let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { throw LibraryError.noContent }
        return try Extractor.parse(html: html)
    }
}
