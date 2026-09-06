import UIKit
import UniformTypeIdentifiers

@MainActor final class ShareViewController: UIViewController {
    private let status = UILabel()
    private var started = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.text = "Saving your link…"
        status.numberOfLines = 0
        status.textAlignment = .center
        status.font = .preferredFont(forTextStyle: .headline)
        status.adjustsFontForContentSizeCategory = true
        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [status, done])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) else {
            status.text = "No link found. Share a webpage from Safari."
            return
        }
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, error in
            let urlString = (item as? URL)?.absoluteString ?? (item as? String)
            let message = error?.localizedDescription
            Task { @MainActor [weak self] in
                guard let self else { return }
                do {
                    guard let urlString, let url = URL(string: urlString),
                          ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                          url.host != nil, url.user == nil, url.password == nil else {
                        self.status.text = message ?? "This item is not a webpage link."
                        return
                    }
                    try ShareInbox.save(url)
                    self.status.text = "Link saved. Open Read It Later to download the text."
                } catch { self.status.text = "Could not save: \(error.localizedDescription)" }
            }
        }
    }

    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
