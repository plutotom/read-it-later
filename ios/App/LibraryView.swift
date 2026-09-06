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
    @Environment(\.scenePhase) private var phase
    @State private var search = ""
    @State private var filter = "All"
    @State private var adding = false
    @State private var settings = false
    @State private var input = ""
    @State private var deleteTarget: Article?
    @State private var exportDocument = LibraryExport(data: Data())
    @State private var exporting = false

    private var filtered: [Article] {
        model.articles.filter {
            (filter != "Unread" || !$0.isRead) && (filter != "Favorites" || $0.isFavorite) &&
            (search.isEmpty || "\($0.title) \($0.url) \($0.text) \($0.note)".localizedCaseInsensitiveContains(search))
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
                    Picker("Library filter", selection: $filter) {
                        ForEach(["All", "Unread", "Favorites"], id: \.self) { Text($0) }
                    }.pickerStyle(.segmented)
                }
                if filtered.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "Your next good read" : "No matches", systemImage: "books.vertical", description: Text("Save a link with + or share one from Safari. Downloaded text stays available offline."))
                }
                ForEach(filtered) { article in
                    NavigationLink {
                        ReaderView(model: model, id: article.id)
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
                    .swipeActions(edge: .leading) {
                        Button { model.mutate { try $0.toggleFavorite(id: article.id) } } label: { Label("Favorite", systemImage: "star") }.tint(.orange)
                    }
                    .swipeActions {
                        Button(role: .destructive) { deleteTarget = article } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
            .navigationTitle("Read It Later")
            .searchable(text: $search, prompt: "Search your library")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { settings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings") }
                ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Save a link").disabled(!model.available) }
            }
            .refreshable { await model.resume() }
        }
        .task { await model.resume() }
        .onChange(of: phase) { _, value in if value == .active { Task { await model.resume() } } }
        .sheet(isPresented: $adding) {
            NavigationStack {
                Form {
                    TextField("https://example.com/article", text: $input)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("The link is saved first. Downloading text requires internet. This test version does not download images, PDFs, or audio.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.navigationTitle("Save a link")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                if let article = model.add(input) {
                                    input = ""; adding = false
                                    Task { await model.download(article) }
                                } else { adding = false }
                            }.disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
            }.presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $settings) {
            NavigationStack {
                Form {
                    Section("Version 0.1 · Local preview") {
                        Text("Your library lives on this iPhone. No account, analytics, or cloud sync. Downloads contact the original website directly.")
                        Text("Deleting the app can remove your library. Export a backup before testing upgrades.")
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
                    Section("Coming later") { Text("Account sync, rich HTML/images, highlights, folders, PDFs, and text-to-speech are not included in this test build.") }
                }.navigationTitle("Settings")
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { settings = false } } }
            }
        }
        .fileExporter(isPresented: $exporting, document: exportDocument, contentType: .json, defaultFilename: "read-it-later-backup") { result in
            if case .failure(let error) = result { model.error = error.localizedDescription }
        }
        .alert("Something needs attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .confirmationDialog("Delete article and its note from this iPhone?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let article = deleteTarget { model.mutate { try $0.delete(id: article.id) } }
                deleteTarget = nil
            }
        }
    }
}
