import CoreTransferable
import SwiftUI
import ReadingCore

struct SaveArticleSheet: View {
    let model: LibraryModel
    var onSaved: (Article, Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Article URL", text: $input, prompt: Text("https://example.com/article"))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit(save)
                        .accessibilityIdentifier("articleURLInput")
                    HStack {
                        PasteButton(payloadType: PastedArticleLink.self) { links in
                            guard let link = links.first else { return }
                            input = link.value.trimmingCharacters(in: .whitespacesAndNewlines)
                        }
                        .buttonBorderShape(.capsule)
                        .labelStyle(.titleAndIcon)
                        .accessibilityLabel("Paste article link")
                        .accessibilityIdentifier("pasteArticleLink")
                        Spacer()
                    }
                } header: {
                    Text("Article link")
                } footer: {
                    Text("Paste a copied link or type one above, then tap Save.")
                }
                Section {
                    Label("Save now, read offline later", systemImage: "arrow.down.circle")
                    Text("Text downloads in the background for offline reading. Images and PDFs are not downloaded. Audio is prepared when you listen.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Save a link")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .alert("Could not save link", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        guard !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let existingIDs = Set(model.articles.map(\.id))
        if let article = model.add(input) {
            onSaved(article, existingIDs.contains(article.id))
            dismiss()
        } else {
            error = model.error ?? "Could not save your link. Please try again."
            model.error = nil
        }
    }
}

/// Accept Safari's URL payloads and links copied as plain text, without reading the clipboard on open.
private struct PastedArticleLink: Transferable, Sendable {
    let value: String

    static var transferRepresentation: some TransferRepresentation {
        ProxyRepresentation(importing: { (url: URL) in Self(value: url.absoluteString) })
        ProxyRepresentation(importing: { (text: String) in Self(value: text) })
    }
}
