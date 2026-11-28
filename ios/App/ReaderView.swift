import SwiftUI
import ReadingCore

struct ReaderView: View {
    @Bindable var model: LibraryModel
    @Environment(ListeningPlayer.self) private var player
    @Environment(SpeechSetup.self) private var speech
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let id: String
    let expandPlayer: () -> Void
    @AppStorage("readerSize") private var readerSize = 19.0
    @State private var preparationTask: Task<Void, Never>?
    @State private var preparationID: UUID?
    @State private var preparingAudio = false
    @State private var audioError: String?
    @State private var showingSnapshots = false
    @State private var snapshots: [NativeLibraryTextSnapshot] = []
    @State private var editingNote = false
    @State private var note = ""
    @State private var editingNoteID: String?
    @State private var notes: [LibraryNote] = []
    @State private var noteError: String?
    @State private var highlights: [Highlight] = []
    @State private var showingHighlights = false
    @State private var highlightError: String?
    @State private var followVisibility: SpokenTextFollowVisibility = .hidden
    @State private var followToken = 0
    @State private var showingOriginalWebsite = false
    @State private var showWebViewHint = false
    @State private var showingMenu = false
    @State private var showingDelete = false
    @State private var chromeHeight: CGFloat = 76
    private var article: Article? { model.articles.first { $0.id == id } }
    private var originalWebsiteURL: URL? { article.flatMap { ArticleWebURL.parse($0.url) } }
    private var isWebView: Bool { showingOriginalWebsite && originalWebsiteURL != nil }
    private var spokenAnchor: SpokenTextAnchor? { player.spokenTextAnchor(forArticleID: id) }
    private var showSpokenFollowButton: Bool {
        SpokenTextScroll.shouldShowButton(
            sessionAllows: spokenAnchor != nil,
            visibility: followVisibility
        )
    }

    var body: some View {
        Group {
            if let article {
                ZStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(URL(string: article.url)?.host ?? "Article").font(.subheadline).foregroundStyle(.secondary)
                        Text(article.title).font(.largeTitle.bold())
                        if article.isDownloaded || !highlights.isEmpty {
                            Button { showingHighlights = true; showingMenu = false } label: {
                                Label("Highlights (\(highlights.count))", systemImage: "highlighter")
                            }.accessibilityIdentifier("showHighlights")
                        }
                        if article.isDownloaded {
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
                                              followToken: followToken,
                                              onFollowVisibilityChange: { followVisibility = $0 },
                                              play: { offset in
                                preparationTask = Task { await listen(offset: offset) }
                            }) { range in
                                let saved = model.mutate { _ = try $0.addHighlight(articleId: id, content: article.text, range: range) }
                                loadHighlights()
                                return saved
                            }
                        } else {
                            ContentUnavailableView("Your link is safe", systemImage: "arrow.down.circle", description: Text("Download the text while online, then read it anywhere."))
                        }
                        if !article.isDownloaded, model.serverArticleID(id) != nil {
                            Button { Task { await model.restoreDownloadedText(id) } } label: { Label("Restore saved text", systemImage: "arrow.down.doc") }
                                .buttonStyle(.bordered).accessibilityIdentifier("restoreSavedText")
                        }
                        if (!article.isDownloaded || article.error != nil), ArticleOriginalSite.url(from: article.url) != nil {
                            Button { Task { await model.download(article) } } label: {
                                if model.downloading.contains(id) { ProgressView() } else { Label("Download text", systemImage: "arrow.down.circle") }
                            }.buttonStyle(.borderedProminent).disabled(model.downloading.contains(id))
                        }
                        if model.annotationSyncEnabled, !notes.isEmpty {
                            Divider()
                            Text("Your notes").font(.headline)
                            ForEach(notes) { saved in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(saved.content).textSelection(.enabled)
                                    HStack {
                                        Button { editingNoteID = saved.id; note = saved.content; editingNote = true } label: { Text("Edit").frame(minWidth: 44, minHeight: 44) }.accessibilityIdentifier("editNote-\(saved.id)")
                                        Button(role: .destructive) {
                                            if !model.mutate({ try $0.deleteNote(id: saved.id) }) { noteError = model.error; model.error = nil }
                                            loadAnnotations()
                                        } label: { Text("Delete").frame(minWidth: 44, minHeight: 44) }.accessibilityIdentifier("deleteNote-\(saved.id)")
                                    }.buttonStyle(.borderless)
                                }.padding(.vertical, 6)
                            }
                        } else if !model.annotationSyncEnabled, !article.note.isEmpty {
                            Divider()
                            Text("Your note").font(.headline)
                            Text(article.note).textSelection(.enabled)
                        }
                        if let url = ArticleWebURL.parse(article.url) { Link("Open original website", destination: url) }
                    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
                }
                .opacity(isWebView ? 0 : 1)
                .allowsHitTesting(!isWebView)
                .accessibilityHidden(isWebView)
                if isWebView, let url = originalWebsiteURL {
                    ArticleWebsiteView(
                        url: url,
                        title: article.title,
                        showEmbeddingHint: showWebViewHint,
                        onDismissEmbeddingHint: { showWebViewHint = false }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
                }
                }
                .navigationBarBackButtonHidden(true)
                .toolbar(.hidden, for: .navigationBar)
            } else { ContentUnavailableView("Article not found", systemImage: "doc") }
        }
        .safeAreaInset(edge: .bottom, spacing: 8) {
            VStack(spacing: 8) {
                if !isWebView {
                    if showSpokenFollowButton {
                        Button { followToken += 1 } label: {
                            Label("Spoken text", systemImage: followVisibility == .visible(direction: .up) ? "arrow.up.to.line" : "arrow.down.to.line")
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(.regularMaterial, in: Capsule())
                                .overlay(Capsule().stroke(.primary.opacity(0.08)))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Show spoken text")
                        .accessibilityHint("Scrolls to the words currently being spoken")
                        .accessibilityIdentifier("jumpToSpokenText")
                        .frame(maxWidth: .infinity)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if player.document != nil { MiniListeningPlayer(player: player, expand: expandPlayer) }
                }
                if article != nil {
                    ReaderActionBar(
                        context: chromeContext,
                        shareURL: originalWebsiteURL,
                        menuOpen: showingMenu,
                        onBack: { showingMenu = false; dismiss() },
                        onToggleMenu: {
                            withAnimation(menuAnimation) { showingMenu.toggle() }
                        },
                        onAction: handleChromeAction
                    )
                }
            }
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: ReaderChromeHeightKey.self, value: proxy.size.height)
                }
            )
        }
        .onPreferenceChange(ReaderChromeHeightKey.self) { chromeHeight = $0 }
        .overlay {
            if showingMenu {
                VStack(spacing: 0) {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(menuAnimation) { showingMenu = false }
                        }
                        .accessibilityLabel("Dismiss reading options")
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("dismissReadingOptions")
                    Color.clear.frame(height: chromeHeight)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if showingMenu, article != nil {
                VStack(spacing: 10) {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
                        ReaderOverflowMenu(
                            context: chromeContext,
                            shareURL: originalWebsiteURL,
                            onDismiss: {
                                withAnimation(menuAnimation) { showingMenu = false }
                            },
                            onAction: handleChromeAction
                        )
                    }
                    Color.clear.frame(height: chromeHeight)
                }
                .allowsHitTesting(true)
            }
        }
        .animation(.snappy, value: showSpokenFollowButton)
        .animation(menuAnimation, value: showingMenu)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Could not start listening", isPresented: Binding(get: { audioError != nil }, set: { if !$0 { audioError = nil } })) {
            Button("OK") { audioError = nil }
        } message: { Text(audioError ?? "") }
        .confirmationDialog(model.syncEnabled ? "Delete this article from your account?" : "Delete article and its note from this iPhone?", isPresented: $showingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { deleteArticle() }
            Button("Cancel", role: .cancel) { showingDelete = false }
        }
        .alert("Could not update note", isPresented: Binding(get: { noteError != nil && !editingNote }, set: { if !$0 { noteError = nil } })) {
            Button("OK") { noteError = nil }
        } message: { Text(noteError ?? "") }
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
        .task(id: id) { loadAnnotations() }
        .onChange(of: id) { _, _ in
            showingOriginalWebsite = false
            showWebViewHint = false
            showingMenu = false
        }
        .onChange(of: model.contentRevision) { _, _ in loadAnnotations() }
        .onDisappear { preparationTask?.cancel(); if let preparationID { player.cancelPreparation(preparationID) } }
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
                            if model.mutate({ library in
                                if model.annotationSyncEnabled {
                                    if let editingNoteID { try library.updateNote(id: editingNoteID, content: note) }
                                    else { _ = try library.createNote(articleId: id, content: note) }
                                } else { try library.saveNote(id: id, text: note) }
                            }) {
                                loadAnnotations()
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

    private var menuAnimation: Animation? { reduceMotion ? nil : .snappy }

    private var listenTitle: String {
        if preparingAudio { return "Preparing…" }
        if speech.accountMode && !speech.usingAccountPreview { return "Listen" }
        return player.isSilentPreview ? "Try listening preview" : "Listen"
    }

    private var chromeContext: ReaderActionCatalog.Context {
        let article = article
        return ReaderActionCatalog.Context(
            isWebView: isWebView,
            canSwitchView: originalWebsiteURL != nil,
            isRead: article?.isRead ?? false,
            isArchived: article?.isArchived ?? false,
            annotationSyncEnabled: model.annotationSyncEnabled,
            canListen: article?.isDownloaded == true,
            listenTitle: listenTitle,
            highlightCount: highlights.count,
            showHighlights: article?.isDownloaded == true || !highlights.isEmpty,
            canViewOriginalSite: article.flatMap { ArticleOriginalSite.url(from: $0.url) } != nil,
            canShare: originalWebsiteURL != nil,
            showSavedVersions: model.syncEnabled,
            preparingAudio: preparingAudio
        )
    }

    private func handleChromeAction(_ kind: ReaderActionCatalog.Kind) {
        switch kind {
        case .listen:
            preparationTask = Task { await listen(offset: nil) }
        case .notes:
            if let article { beginNote(article: article) }
        case .highlights:
            showingHighlights = true
        case .markRead:
            model.mutate { try $0.toggleRead(id: id) }
        case .archive:
            model.mutate { try $0.toggleArchived(id: id) }
        case .delete:
            showingDelete = true
        case .switchView:
            if isWebView {
                showWebViewHint = false
                showingOriginalWebsite = false
            } else {
                showOriginalWebsite()
            }
        case .viewOriginalSite:
            if let article, let url = ArticleOriginalSite.url(from: article.url) { openURL(url) }
        case .largerText:
            readerSize = min(30, readerSize + 2)
        case .smallerText:
            readerSize = max(15, readerSize - 2)
        case .savedVersions:
            snapshots = model.textSnapshots(id)
            showingSnapshots = true
        case .share, .more:
            break
        }
        dismissOverflowMenu(after: kind)
    }

    /// Keep Larger/Smaller text on the card so the size can be stepped while the
    /// article reflows behind it. Other overflow actions still close the menu.
    private func dismissOverflowMenu(after kind: ReaderActionCatalog.Kind) {
        guard kind != .more, kind != .largerText, kind != .smallerText else { return }
        withAnimation(menuAnimation) { showingMenu = false }
    }

    private func deleteArticle() {
        let playing = player.document?.articleID == id
        if model.mutate({ try $0.delete(id: id) }) {
            if playing { player.close() }
            dismiss()
        }
    }

    @MainActor private func listen(offset: Int?) async {
        guard !preparingAudio, let initial = article else { return }
        let intent = player.beginPreparation(); preparationID = intent
        preparingAudio = true; defer { preparingAudio = false; preparationID = nil }
        do {
            let document: ListeningDocument
            if speech.accountMode && !speech.usingAccountPreview {
                if model.serverArticleID(id) == nil { await model.synchronize() }
                guard let serverID = model.serverArticleID(id), let current = article else { throw SpeechError.backend("This article is waiting to sync. Connect to the internet and try again.") }
                document = try await speech.accountDocument(serverID: serverID, localID: id, text: current.text, player: player, expectedIntent: intent)
                guard model.available else { return }
            } else { document = ListeningDocument(articleID: id, title: initial.title, text: initial.text) }
            let paragraph = offset.flatMap { document.chunk(atUTF16Offset: $0) }.map { document.chunks[$0].paragraph }
            try Task.checkCancellation()
            player.start(document, paragraph: paragraph, expectedIntent: intent)
        } catch is CancellationError { }
        catch { if player.intentToken == intent { audioError = error.localizedDescription } }
    }

    @MainActor private func showOriginalWebsite() {
        player.pause()
        if !showingOriginalWebsite {
            showWebViewHint = ArticleWebViewHintStore.consumeFirstVisit(articleID: id)
        }
        showingOriginalWebsite = true
    }

    private func beginNote(article: Article) {
        editingNoteID = nil
        note = model.annotationSyncEnabled ? "" : article.note
        editingNote = true
    }

    private func loadAnnotations() {
        loadHighlights()
        do { notes = try model.notes(articleId: id) }
        catch { model.error = error.localizedDescription }
    }

    private func loadHighlights() {
        do { highlights = try model.highlights(articleId: id) }
        catch { model.error = error.localizedDescription }
    }
}

private struct ReaderChromeHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 76
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
