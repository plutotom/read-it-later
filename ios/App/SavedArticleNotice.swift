import SwiftUI
import ReadingCore

struct SavedArticleFeedback {
    let id = UUID()
    let articleID: String
    let wasAlreadySaved: Bool
}

struct SavedArticleNotice: View {
    let article: Article
    let wasAlreadySaved: Bool
    let isDownloading: Bool
    var onDismiss: () -> Void

    private var status: String {
        if isDownloading { return "Downloading text for offline reading…" }
        if article.isDownloaded { return "Text is ready to read offline." }
        if article.error != nil { return "Link saved. Text download failed; open the article to retry." }
        return "Link saved on this iPhone. Text will download when available."
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2).foregroundStyle(.green)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(wasAlreadySaved ? "Already in your library" : "Added to your library")
                    .font(.headline)
                Text(article.title).font(.subheadline).lineLimit(2)
                HStack(alignment: .top, spacing: 6) {
                    if isDownloading { ProgressView().controlSize(.mini) }
                    Text(status).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button(action: onDismiss) {
                Image(systemName: "xmark").foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss save confirmation")
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityIdentifier("articleSaveConfirmation")
    }
}
