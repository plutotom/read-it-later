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
        let visitor = ArticleTextVisitor()
        try NodeTraversor(visitor).traverse(root)
        let text = visitor.finish()
        guard text.count >= 80 else { throw LibraryError.noContent }
        let title = try doc.title()
        return ExtractedArticle(title: title.isEmpty ? String(text.prefix(70)) : title, text: text)
    }
}

/// Visit every text node once, including legacy font/table text surrounding semantic blocks.
private final class ArticleTextVisitor: NodeVisitor {
    private var paragraphs: [String] = []
    private var fragments: [String] = []
    private var preformattedDepth = 0

    func head(_ node: Node, _ depth: Int) throws {
        if let text = node as? TextNode {
            fragments.append(text.getWholeText())
        } else if let element = node as? Element {
            if element.tagName() == "br", preformattedDepth > 0 {
                fragments.append("\n")
                return
            }
            if element.isBlock() || element.tagName() == "br" { flush() }
            if element.tagName() == "pre" { preformattedDepth += 1 }
        }
    }

    func tail(_ node: Node, _ depth: Int) throws {
        guard let element = node as? Element else { return }
        if element.isBlock() { flush() }
        if element.tagName() == "pre" { preformattedDepth -= 1 }
    }

    func finish() -> String {
        flush()
        return paragraphs.joined(separator: "\n\n")
    }

    private func flush() {
        let raw = fragments.joined()
        let text = preformattedDepth > 0
            ? raw.trimmingCharacters(in: .whitespacesAndNewlines)
            : raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if !text.isEmpty { paragraphs.append(text) }
        fragments.removeAll(keepingCapacity: true)
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
