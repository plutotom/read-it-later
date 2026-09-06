import SwiftUI
import ReadingCore

struct ReaderView: View {
    @Bindable var model: LibraryModel
    let id: String
    @AppStorage("readerSize") private var readerSize = 19.0
    @State private var editingNote = false
    @State private var note = ""
    private var article: Article? { model.articles.first { $0.id == id } }

    var body: some View {
        Group {
            if let article {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(URL(string: article.url)?.host ?? "Article").font(.subheadline).foregroundStyle(.secondary)
                        Text(article.title).font(.largeTitle.bold())
                        if let error = article.error {
                            Label(error, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(.orange)
                        }
                        if article.isDownloaded {
                            Text(article.text).font(.custom("Georgia", size: readerSize, relativeTo: .body))
                                .lineSpacing(7).textSelection(.enabled)
                        } else {
                            ContentUnavailableView("Your link is safe", systemImage: "arrow.down.circle", description: Text("Download the text while online, then read it anywhere."))
                        }
                        if !article.isDownloaded || article.error != nil {
                            Button { Task { await model.download(article) } } label: {
                                if model.downloading.contains(id) { ProgressView() } else { Label("Download text", systemImage: "arrow.down.circle") }
                            }.buttonStyle(.borderedProminent).disabled(model.downloading.contains(id))
                        }
                        if !article.note.isEmpty {
                            Divider()
                            Text("Your note").font(.headline)
                            Text(article.note).textSelection(.enabled)
                        }
                        if let url = URL(string: article.url) { Link("Open original website", destination: url) }
                    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button(article.isRead ? "Mark unread" : "Mark read", systemImage: "checkmark.circle") { model.mutate { try $0.toggleRead(id: id) } }
                            Button(article.isFavorite ? "Remove favorite" : "Favorite", systemImage: "star") { model.mutate { try $0.toggleFavorite(id: id) } }
                            Button("Edit note", systemImage: "square.and.pencil") { note = article.note; editingNote = true }
                            Button("Larger text", systemImage: "textformat.size.larger") { readerSize = min(30, readerSize + 2) }
                            Button("Smaller text", systemImage: "textformat.size.smaller") { readerSize = max(15, readerSize - 2) }
                            if let url = URL(string: article.url) { ShareLink(item: url) }
                        } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Reading options")
                    }
                }
            } else { ContentUnavailableView("Article not found", systemImage: "doc") }
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editingNote) {
            NavigationStack {
                TextEditor(text: $note).padding().accessibilityLabel("Article note")
                    .navigationTitle("Your note")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingNote = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Save") {
                            model.mutate { try $0.saveNote(id: id, text: note) }
                            editingNote = false
                        } }
                    }
            }
        }
    }
}
