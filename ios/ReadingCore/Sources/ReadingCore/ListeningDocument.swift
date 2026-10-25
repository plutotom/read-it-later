import Foundation

/// All ranges use UTF-16 offsets into the original, unmodified article text.
public struct ListeningDocument: Equatable, Sendable {
    public struct Chunk: Equatable, Sendable, Identifiable {
        public let id: Int
        public let paragraph: Int
        public let range: NSRange
        public let text: String
        public var estimatedDuration: TimeInterval {
            max(0.5, Double(text.split(whereSeparator: \.isWhitespace).count) / 2.8)
        }
    }

    public let articleID: String
    public let title: String
    public let text: String
    public let chunks: [Chunk]
    public let paragraphs: [NSRange]
    public let serverArticleID: String?
    public let serverRevision: String?

    public init(articleID: String, title: String, text: String) {
        self.serverArticleID = nil; self.serverRevision = nil
        self.articleID = articleID
        self.title = title
        self.text = text
        let source = text as NSString
        let paragraphPattern = try! NSRegularExpression(pattern: #"\S(?:[^\n]|\n(?!\s*\n))*"#)
        let wordPattern = try! NSRegularExpression(pattern: #"\S+"#)
        var paragraphs: [NSRange] = []
        var chunks: [Chunk] = []
        for match in paragraphPattern.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            var range = match.range
            range.length = source.substring(with: range).trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
            guard range.length > 0 else { continue }
            let paragraph = paragraphs.count
            paragraphs.append(range)
            let words = wordPattern.matches(in: text, range: range)
            // Bounded requests even when a publisher provides an enormous paragraph.
            // Prefer sentence endings; split oversized sentences at word boundaries.
            var start = range.location
            var count = 0
            for (index, word) in words.enumerated() {
                count += 1
                let end = NSMaxRange(word.range)
                let token = source.substring(with: word.range)
                let sentenceEnd = token.last.map { ".!?。！？".contains($0) } ?? false
                if count >= 60 || end - start >= 1800 || (count >= 30 && sentenceEnd) || index == words.count - 1 {
                    let chunkRange = NSRange(location: start, length: end - start)
                    let value = source.substring(with: chunkRange)
                    var pieceStart = chunkRange.location
                    var pieceLength = 0
                    for character in value {
                        let length = String(character).utf16.count
                        if pieceLength > 0 && pieceLength + length > 2000 {
                            let piece = NSRange(location: pieceStart, length: pieceLength)
                            chunks.append(Chunk(id: chunks.count, paragraph: paragraph, range: piece, text: source.substring(with: piece)))
                            pieceStart += pieceLength; pieceLength = 0
                        }
                        pieceLength += length
                    }
                    if pieceLength > 0 {
                        let piece = NSRange(location: pieceStart, length: pieceLength)
                        chunks.append(Chunk(id: chunks.count, paragraph: paragraph, range: piece, text: source.substring(with: piece)))
                    }
                    start = index + 1 < words.count ? words[index + 1].range.location : end
                    count = 0
                }
            }
        }
        self.paragraphs = paragraphs
        self.chunks = chunks
    }

    public init(manifest: AccountListeningManifest, localArticleID: String) throws {
        try manifest.validate()
        articleID = localArticleID; title = manifest.title; text = manifest.text
        serverArticleID = manifest.articleId; serverRevision = manifest.revision
        paragraphs = manifest.paragraphs.map { NSRange(location: $0.start, length: $0.end - $0.start) }
        chunks = manifest.segments.map { Chunk(id: $0.index, paragraph: $0.paragraph, range: NSRange(location: $0.start, length: $0.end - $0.start), text: $0.text) }
    }

    public func chunk(atUTF16Offset offset: Int) -> Int? {
        chunks.first(where: { NSLocationInRange(offset, $0.range) })?.id
    }

    public func firstChunk(inParagraph paragraph: Int) -> Int? {
        chunks.first(where: { $0.paragraph == paragraph })?.id
    }
}
