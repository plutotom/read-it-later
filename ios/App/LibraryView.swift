import SwiftUI
import UniformTypeIdentifiers
import ReadingCore

struct LibraryExport: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct LibraryView: View {
    @Bindable var model: LibraryModel
    @Environment(ListeningPlayer.self) private var player
    @Environment(AccountAuth.self) private var auth
    @State private var showingPlayer = false
    @Environment(\.scenePhase) private var phase
    @State private var search = ""
    @State private var filter = "All"
    @State private var adding = false
    @State private var settings = false
    @State private var input = ""
    @State private var addError: String?
    @State private var deleteTarget: Article?
    @State private var exportDocument = LibraryExport(data: Data())
    @State private var exporting = false

    private var filtered: [Article] {
        model.articles.filter {
            (ArticleLibraryFilter(rawValue: filter) ?? .all).includes($0) &&
            (search.isEmpty || "\($0.title) \($0.url) \($0.text) \(model.annotationSyncEnabled ? model.noteSearchText[$0.id] ?? "" : $0.note)".localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("A little space to read.").font(.title2.bold())
                        Text("\(model.articles.filter(\.isDownloaded).count) saved offline · On this iPhone")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                    if model.syncEnabled {
                        if model.pendingChanges > 0 {
                            HStack(spacing: 6) {
                                if model.syncing { ProgressView().controlSize(.small) }
                                Text(model.syncing ? "Syncing…" : "\(model.pendingChanges) changes waiting to sync")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        if let message = model.syncError { Text(message).font(.caption).foregroundStyle(.orange) }
                    }
                    Picker("Library filter", selection: $filter) {
                        ForEach(ArticleLibraryFilter.allCases, id: \.rawValue) { Text($0.rawValue).tag($0.rawValue) }
                    }.pickerStyle(.segmented)
                }
                if filtered.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "Your next good read" : "No matches", systemImage: "books.vertical", description: Text("Save a link with + or share one from Safari. Downloaded text stays available offline."))
                }
                ForEach(filtered) { article in
                    NavigationLink {
                        ReaderView(model: model, id: article.id, expandPlayer: { showingPlayer = true })
                    } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(URL(string: article.url)?.host ?? article.url)
                                .font(.caption).foregroundStyle(.secondary)
                            Text(article.title).font(.headline).lineLimit(3)
                            HStack {
                                Label(article.isDownloaded ? "Text available offline" : "Link saved", systemImage: article.isDownloaded ? "checkmark.circle" : "link")
                                if article.isFavorite { Image(systemName: "star.fill") }
                                if article.isRead { Text("Read") }
                                if model.downloading.contains(article.id) { ProgressView() }
                            }.font(.caption).foregroundStyle(.secondary)
                            if article.error != nil { Text("Download needs attention").font(.caption).foregroundStyle(.orange) }
                        }.padding(.vertical, 7)
                    }
                    // First button on each edge is the full-swipe action (read / archive).
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        articleSwipeButton(ArticleSwipeAction.read(for: article), article: article)
                        articleSwipeButton(ArticleSwipeAction.favorite(for: article), article: article)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        articleSwipeButton(ArticleSwipeAction.archive(for: article), article: article)
                        articleSwipeButton(ArticleSwipeAction.delete, article: article)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if player.document != nil { MiniListeningPlayer(player: player) { showingPlayer = true } }
            }
            .navigationTitle("Paper Drive")
            .searchable(text: $search, prompt: "Search your library")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { settings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings") }
                ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Save a link").disabled(!model.available) }
            }
            .refreshable { await model.resume() }
        }
        .fullScreenCover(isPresented: $showingPlayer) { ListeningPlayerView(player: player) }
        .task { await model.resume() }
        .onChange(of: phase) { _, value in
            if value == .active { Task { await model.resume() } }
        }
        .sheet(isPresented: $adding) {
            NavigationStack {
                Form {
                    TextField("Article URL", text: $input, prompt: Text(verbatim: "e.g. https://example.com/article").foregroundStyle(.secondary))
                        .foregroundStyle(.primary)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("articleURLInput")
                    Text("The link is saved first. Downloading text requires internet. Images and PDFs are not downloaded. Audio is prepared when you listen.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.navigationTitle("Save a link")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                if let article = model.add(input) {
                                    input = ""; adding = false
                                    Task { await model.download(article) }
                                } else {
                                    addError = model.error ?? "Could not save your link. Please try again."
                                    model.error = nil
                                }
                            }.disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
            }
            .alert("Could not save link", isPresented: Binding(get: { addError != nil }, set: { if !$0 { addError = nil } })) {
                Button("OK") { addError = nil }
            } message: { Text(addError ?? "") }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $settings) {
            NavigationStack {
                Form {
                    Section("Account") {
                        if let session = auth.session {
                            Text(session.user.name)
                            Text(session.user.email).foregroundStyle(.secondary).accessibilityIdentifier("accountEmail")
                        }
                        if auth.offline { Text("Offline · downloaded articles are available.").foregroundStyle(.secondary) }
                        Button("Sign out", role: .destructive) { Task { await auth.signOut() } }.accessibilityIdentifier("accountSignOut")
                    }
                    if model.syncEnabled {
                        Section("Library sync") {
                            LabeledContent("Waiting changes", value: String(model.pendingChanges)).accessibilityIdentifier("syncPending")
                            if let date = model.lastSync { LabeledContent("Last synced") { Text(date, style: .relative) } }
                            if let message = model.syncError { Text(message).foregroundStyle(.orange) }
                            Button(model.syncing ? "Syncing…" : "Sync now") { Task { await model.synchronize() } }.disabled(model.syncing).accessibilityIdentifier("syncNow")
                            Text("Articles, read/favorite/archive state, notes, highlights and deletions sync with your web account. Offline edits stay queued for this account. Saved quotes remain available when their original position cannot be verified.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Section("Native reader") {
                        Text("Your account library is available offline. Downloads contact the original website directly. Web sync requires the matching backend release.")
                        Text("Deleting the app can remove your library. Export a backup before testing upgrades.")
                    }
                    SpeechSettings()
                    Section("Storage") {
                        NavigationLink {
                            ManageStorageView(model: model)
                        } label: { Label("Manage storage", systemImage: "internaldrive") }
                    }
                    Section("Backup") {
                        Button("Export library as JSON") {
                            if let data = model.export() {
                                exportDocument = LibraryExport(data: data)
                                settings = false
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { exporting = true }
                            }
                        }
                    }
                    Section("Coming later") { Text("Annotation sync, rich HTML/images, folders, and PDFs are coming later. Account listening uses the voices configured on your backend.") }
                }.navigationTitle("Settings")
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { settings = false } } }
            }
        }
        .fileExporter(isPresented: $exporting, document: exportDocument, contentType: .json, defaultFilename: "paper-drive-backup") { result in
            if case .failure(let error) = result { model.error = error.localizedDescription }
        }
        .alert("Something needs attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .confirmationDialog(model.syncEnabled ? "Delete this article from your account?" : "Delete article and its note from this iPhone?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let article = deleteTarget, model.mutate({ try $0.delete(id: article.id) }), player.document?.articleID == article.id { player.close() }
                deleteTarget = nil
            }
        }
    }

    @ViewBuilder
    private func articleSwipeButton(_ action: ArticleSwipeAction, article: Article) -> some View {
        Button(role: action.isDestructive ? .destructive : nil) {
            switch action.kind {
            case .read: model.mutate { try $0.toggleRead(id: article.id) }
            case .favorite: model.mutate { try $0.toggleFavorite(id: article.id) }
            case .archive: model.mutate { try $0.toggleArchived(id: article.id) }
            case .delete: deleteTarget = article
            }
        } label: {
            Label(action.title, systemImage: action.systemImage)
        }
        .tint(action.tint.color)
        .accessibilityLabel(action.accessibilityLabel)
    }
}

private extension ArticleSwipeAction.Tint {
    var color: Color {
        switch self {
        case .blue: .blue
        case .orange: .orange
        case .gray: .gray
        case .red: .red
        }
    }
}
