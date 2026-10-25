import SwiftUI
import ReadingCore

struct ReaderView: View {
    @Bindable var model: LibraryModel
    @Environment(ListeningPlayer.self) private var player
    @Environment(SpeechSetup.self) private var speech
    let id: String
    @AppStorage("readerSize") private var readerSize = 19.0
    @State private var preparingAudio = false
    @State private var audioError: String?
    @State private var showingSnapshots = false
    @State private var snapshots: [NativeLibraryTextSnapshot] = []
    @State private var editingNote = false
    @State private var note = ""
    @State private var noteError: String?
    @State private var highlights: [Highlight] = []
    @State private var showingHighlights = false
    @State private var highlightError: String?
    private var article: Article? { model.articles.first { $0.id == id } }

    var body: some View {
        Group {
            if let article {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(URL(string: article.url)?.host ?? "Article").font(.subheadline).foregroundStyle(.secondary)
                        Text(article.title).font(.largeTitle.bold())
                        HStack {
                            Button { note = article.note; editingNote = true } label: {
                                Label("Add a note", systemImage: "square.and.pencil")
                            }.buttonStyle(.bordered)
                            Button { model.mutate { try $0.toggleRead(id: id) } } label: {
                                Label(article.isRead ? "Read" : "Mark read", systemImage: article.isRead ? "checkmark.circle.fill" : "checkmark.circle")
                            }.buttonStyle(.bordered)
                        }
                        if article.isDownloaded || !highlights.isEmpty {
                            Button { showingHighlights = true } label: {
                                Label("Highlights (\(highlights.count))", systemImage: "highlighter")
                            }.accessibilityIdentifier("showHighlights")
                        }
                        if article.isDownloaded {
                            Button {
                                Task { await listen(offset: nil) }
                            } label: { Label(preparingAudio ? "Preparing…" : speech.accountMode && !speech.usingAccountPreview ? "Listen" : player.isSilentPreview ? "Try listening preview" : "Listen", systemImage: "headphones") }
                                .buttonStyle(.bordered).disabled(preparingAudio).accessibilityIdentifier("startListening")
                            Text("\(player.isSilentPreview ? "Silent preview · " : "")Tap a paragraph to play from there. Long-press to select and highlight text.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if let error = article.error {
                            Label(error, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(.orange)
                        }
                        if article.isDownloaded {
                            HighlightTextView(text: article.text, highlights: highlights, fontSize: readerSize,
                                              activeRange: player.document?.articleID == id ? player.currentChunk?.range : nil,
                                              wordRange: player.document?.articleID == id ? player.wordRange : nil,
                                              play: { offset in
                                Task { await listen(offset: offset) }
                            }) { range in
                                let saved = model.mutate { _ = try $0.addHighlight(articleId: id, content: article.text, range: range) }
                                loadHighlights()
                                return saved
                            }
                        } else {
                            ContentUnavailableView("Your link is safe", systemImage: "arrow.down.circle", description: Text("Download the text while online, then read it anywhere."))
                        }
                        if (!article.isDownloaded || article.error != nil), let source = URL(string: article.url), ["http", "https"].contains(source.scheme?.lowercased() ?? "") {
                            Button { Task { await model.download(article) } } label: {
                                if model.downloading.contains(id) { ProgressView() } else { Label("Download text", systemImage: "arrow.down.circle") }
                            }.buttonStyle(.borderedProminent).disabled(model.downloading.contains(id))
                        }
                        if !article.note.isEmpty {
                            Divider()
                            Text("Your note").font(.headline)
                            Text(article.note).textSelection(.enabled)
                        }
                        if let url = URL(string: article.url), ["http", "https"].contains(url.scheme?.lowercased() ?? "") { Link("Open original website", destination: url) }
                    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button(article.isRead ? "Mark unread" : "Mark read", systemImage: "checkmark.circle") { model.mutate { try $0.toggleRead(id: id) } }
                            Button(article.isFavorite ? "Remove favorite" : "Favorite", systemImage: "star") { model.mutate { try $0.toggleFavorite(id: id) } }
                            Button(article.isArchived ? "Move to Inbox" : "Archive", systemImage: "archivebox") { model.mutate { try $0.toggleArchived(id: id) } }
                            Button("Edit note", systemImage: "square.and.pencil") { note = article.note; editingNote = true }
                            if model.syncEnabled {
                                Button("Saved text versions", systemImage: "clock.arrow.circlepath") { snapshots = model.textSnapshots(id); showingSnapshots = true }
                            }
                            Button("Larger text", systemImage: "textformat.size.larger") { readerSize = min(30, readerSize + 2) }
                            Button("Smaller text", systemImage: "textformat.size.smaller") { readerSize = max(15, readerSize - 2) }
                            if let url = URL(string: article.url) { ShareLink(item: url) }
                        } label: { Label("Reading options", systemImage: "ellipsis.circle") }
                    }
                }
            } else { ContentUnavailableView("Article not found", systemImage: "doc") }
        }
        .navigationBarTitleDisplayMode(.inline)
        .alert("Could not start listening", isPresented: Binding(get: { audioError != nil }, set: { if !$0 { audioError = nil } })) {
            Button("OK") { audioError = nil }
        } message: { Text(audioError ?? "") }
        .sheet(isPresented: $showingSnapshots) {
            NavigationStack {
                List(Array(snapshots.enumerated()), id: \.offset) { _, snapshot in
                    DisclosureGroup {
                        Text(snapshot.text).textSelection(.enabled)
                    } label: {
                        VStack(alignment: .leading) { Text(snapshot.title); Text(snapshot.capturedAt, style: .date).font(.caption).foregroundStyle(.secondary) }
                    }
                }.navigationTitle("Saved text versions")
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingSnapshots = false } } }
            }
        }
        .task(id: id) { loadHighlights() }
        .sheet(isPresented: $showingHighlights) {
            NavigationStack {
                List {
                    if highlights.isEmpty {
                        ContentUnavailableView("No highlights yet", systemImage: "highlighter", description: Text("Select text in the article and choose Highlight."))
                    }
                    ForEach(highlights) { highlight in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(highlight.text).textSelection(.enabled)
                                .padding(8).background(Color(uiColor: highlight.color.uiColor).opacity(0.25), in: RoundedRectangle(cornerRadius: 6))
                            if let article, highlight.range(in: article.text) == nil {
                                Text("Saved quote — article text has changed. This highlight is not painted in the reader.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Picker("Color", selection: Binding(get: { highlight.color }, set: { color in
                                if !model.mutate({ try $0.setHighlightColor(id: highlight.id, color: color) }) { highlightError = model.error; model.error = nil }
                                loadHighlights()
                            })) {
                                ForEach(HighlightColor.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                            }
                            .pickerStyle(.menu)
                            .accessibilityIdentifier("highlightColor")
                            Button("Remove highlight", role: .destructive) {
                                if !model.mutate({ try $0.deleteHighlight(id: highlight.id) }) { highlightError = model.error; model.error = nil }
                                loadHighlights()
                            }.buttonStyle(.borderless)
                        }.padding(.vertical, 6)
                    }
                }.navigationTitle("Highlights")
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingHighlights = false } } }
                    .alert("Could not update highlight", isPresented: Binding(get: { highlightError != nil }, set: { if !$0 { highlightError = nil } })) {
                        Button("OK") { highlightError = nil }
                    } message: { Text(highlightError ?? "") }
            }
        }
        .sheet(isPresented: $editingNote) {
            NavigationStack {
                TextEditor(text: $note).padding().accessibilityLabel("Article note")
                    .navigationTitle("Your note")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingNote = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Save") {
                            if model.mutate({ try $0.saveNote(id: id, text: note) }) {
                                editingNote = false
                            } else {
                                noteError = model.error ?? "Could not save your note. Your draft is still here."
                                model.error = nil
                            }
                        } }
                    }
                    .alert("Note was not saved", isPresented: Binding(get: { noteError != nil }, set: { if !$0 { noteError = nil } })) {
                        Button("OK") { noteError = nil }
                    } message: { Text(noteError ?? "") }
            }
        }
    }

    @MainActor private func listen(offset: Int?) async {
        guard !preparingAudio, let initial = article else { return }
        preparingAudio = true; defer { preparingAudio = false }
        do {
            let document: ListeningDocument
            if speech.accountMode && !speech.usingAccountPreview {
                if model.serverArticleID(id) == nil { await model.synchronize() }
                guard let serverID = model.serverArticleID(id), let current = article else { throw SpeechError.backend("This article is waiting to sync. Connect to the internet and try again.") }
                document = try await speech.accountDocument(serverID: serverID, localID: id, text: current.text, player: player)
                guard model.available else { return }
            } else { document = ListeningDocument(articleID: id, title: initial.title, text: initial.text) }
            let paragraph = offset.flatMap { document.chunk(atUTF16Offset: $0) }.map { document.chunks[$0].paragraph }
            player.start(document, paragraph: paragraph)
        } catch { audioError = error.localizedDescription }
    }

    private func loadHighlights() {
        do { highlights = try model.highlights(articleId: id) }
        catch { model.error = error.localizedDescription }
    }
}
