import SwiftUI
import ReadingCore

struct ManageStorageView: View {
    @Bindable var model: LibraryModel
    @Environment(SpeechSetup.self) private var setup
    @Environment(ListeningPlayer.self) private var player
    @State private var confirmingRemoval = false
    @State private var message: String?
    @State private var busy = false

    private var downloadBytes: Int { model.articles.reduce(0) { $0 + $1.text.utf8.count } }
    private var downloadCount: Int { model.articles.filter(\.isDownloaded).count }
    private var disabled: Bool { busy || setup.changingStorage }
    private func size(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .decimal)
    }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Label("On this iPhone", systemImage: "internaldrive")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text(size(setup.cacheBytes))
                        .font(.system(.largeTitle, design: .rounded, weight: .semibold))
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("cacheUsage")
                    Text("Cached audio · \(setup.cacheCount) sections")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if setup.cacheLimit != .unlimited {
                        ProgressView(value: Double(setup.cacheBytes), total: Double(setup.cacheLimit.bytes))
                            .accessibilityLabel("Cache used")
                            .accessibilityValue("\(size(setup.cacheBytes)) of \(setup.cacheLimit.label)")
                    }
                }.padding(.vertical, 8)
            }

            Section {
                Picker("Cache limit", selection: Binding(get: { setup.cacheLimit }, set: { value in
                    message = nil
                    Task { await setup.setCacheLimit(value) }
                })) {
                    ForEach(CacheLimit.allCases, id: \.self) { Text($0.label).tag($0) }
                }.pickerStyle(.menu).accessibilityIdentifier("cacheLimit").disabled(disabled)
            } footer: {
                Text("Least recently used audio is removed when the cache reaches this limit. Lowering the limit frees space immediately. Unused audio expires after 28 days. Unlimited is still subject to available device storage.")
            }

            Section {
                Button {
                    Task { await clear(includeDownloads: false) }
                } label: {
                    HStack {
                        Text("Clear cache")
                        Spacer()
                        Text(size(setup.cacheBytes)).foregroundStyle(.secondary)
                    }
                }.disabled(disabled).accessibilityIdentifier("clearCache")
            } footer: {
                Text("Clears audio on this iPhone and stops playback. Downloaded article text, saved links, notes, and highlights stay. Audio can be downloaded again when you listen.")
            }

            Section {
                LabeledContent("Downloaded text", value: size(downloadBytes))
                LabeledContent("Articles available offline", value: "\(downloadCount)")
                Button("Remove all cached files & downloads", role: .destructive) {
                    confirmingRemoval = true
                }.disabled(disabled).accessibilityIdentifier("removeAllDownloads")
            } footer: {
                Text("Removes cached audio and downloaded article text from this iPhone. Saved links, titles, notes, and highlight quotes stay in your library. Download text again from each article when needed.")
            }

        }
        .navigationTitle("Manage storage")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if disabled || setup.storageError != nil || message != nil {
                VStack(alignment: .leading, spacing: 8) {
                    if disabled {
                        HStack(spacing: 10) { ProgressView(); Text("Updating storage…") }
                    }
                    if let error = setup.storageError {
                        Text(error).foregroundStyle(.red).accessibilityIdentifier("storageError")
                    }
                    if let message { Text(message).accessibilityIdentifier("storageMessage") }
                }
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.regularMaterial)
            }
        }
        .alert("Remove cached audio and all downloaded text?", isPresented: $confirmingRemoval) {
            Button("Remove caches & downloads", role: .destructive) {
                Task { await clear(includeDownloads: true) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Offline reading and listening will need new downloads. Your saved links, notes, and highlights will stay. Playback will stop.")
        }
        .task {
            // Refresh while visible, including when a speech download finishes in the background.
            while !Task.isCancelled {
                await setup.refreshStats()
                do { try await Task.sleep(for: .seconds(2)) } catch { break }
            }
        }
    }

    @MainActor private func clear(includeDownloads: Bool) async {
        guard !disabled else { return }
        busy = true; message = nil
        model.removingDownloads = includeDownloads
        defer { busy = false; model.removingDownloads = false }
        guard await setup.clear(player) else { return }
        if includeDownloads, !model.removeDownloads() {
            setup.storageError = model.error ?? "Could not remove downloaded text."
            model.error = nil
            return
        }
        message = includeDownloads ? "Cache and downloads removed. Your library and annotations are safe." : "Cache cleared. Downloaded text is still available offline."
    }
}
