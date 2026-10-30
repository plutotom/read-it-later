import SwiftUI
import WebKit
import ReadingCore

/// In-app original website, mounted on demand. Safari remains the escape hatch.
struct ArticleWebsiteView: View {
    let url: URL
    let title: String
    var showEmbeddingHint = false
    var onDismissEmbeddingHint: () -> Void = {}

    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reloadToken = 0
    @State private var isLoading = true
    @State private var isSlow = false
    @State private var loadFailed = false

    private var canLoadInApp: Bool { ArticleWebURL.canLoadInApp(url) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if !canLoadInApp {
                    Text("This site needs to open in Safari.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
                if canLoadInApp {
                    Button {
                        isLoading = true
                        isSlow = false
                        loadFailed = false
                        reloadToken += 1
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Reload original website")
                    .accessibilityIdentifier("reloadOriginalWebsite")
                }
                Button("Open original") { openURL(url) }
                    .accessibilityIdentifier("openOriginalWebsite")
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)

            if canLoadInApp, isLoading {
                Text(isSlow
                     ? "Taking a while? You can open the original above or switch back to Reader."
                     : "Loading original website…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .accessibilityIdentifier("originalWebsiteStatus")
            } else if canLoadInApp, loadFailed {
                Text("Could not load this page. Use Open original to read it in Safari.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .accessibilityIdentifier("originalWebsiteStatus")
            }

            if canLoadInApp {
                OriginalWebsiteWebView(
                    url: url,
                    title: title,
                    reloadToken: reloadToken,
                    isLoading: $isLoading,
                    loadFailed: $loadFailed
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("originalWebsite")
            } else {
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
        .overlay(alignment: .bottom) {
            if canLoadInApp, showEmbeddingHint {
                webViewTip
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: showEmbeddingHint)
        .task(id: "\(url.absoluteString)-\(reloadToken)") {
            guard canLoadInApp else { return }
            isSlow = false
            try? await Task.sleep(for: .seconds(12))
            if !Task.isCancelled, isLoading { isSlow = true }
        }
        .task(id: showEmbeddingHint) {
            guard showEmbeddingHint else { return }
            try? await Task.sleep(for: .seconds(7))
            if !Task.isCancelled { onDismissEmbeddingHint() }
        }
    }

    private var webViewTip: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "info.circle.fill")
                .foregroundStyle(.indigo)
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 4) {
                Text("Page blank or missing something?")
                    .font(.subheadline.weight(.medium))
                Text("Some sites need Safari for sign-in or full features. Use Open original to read the page there.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                onDismissEmbeddingHint()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Dismiss Web view tip")
            .accessibilityIdentifier("dismissWebViewTip")
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.primary.opacity(0.08)))
        .accessibilityIdentifier("webViewTip")
    }
}

private struct OriginalWebsiteWebView: UIViewRepresentable {
    let url: URL
    let title: String
    let reloadToken: Int
    @Binding var isLoading: Bool
    @Binding var loadFailed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Publisher sessions must not persist across readers or signed-in app accounts.
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.accessibilityIdentifier = "originalWebsite"
        view.accessibilityLabel = "Original website: \(title)"
        context.coordinator.reloadToken = reloadToken
        context.coordinator.loadedURL = url
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard context.coordinator.reloadToken != reloadToken || context.coordinator.loadedURL != url else { return }
        context.coordinator.reloadToken = reloadToken
        context.coordinator.loadedURL = url
        view.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: OriginalWebsiteWebView
        var reloadToken: Int
        var loadedURL: URL?

        init(_ parent: OriginalWebsiteWebView) {
            self.parent = parent
            reloadToken = parent.reloadToken
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
            decisionHandler(ArticleWebURL.decision(for: navigationAction.request.url, isMainFrame: isMainFrame) == .allow ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadFailed = false
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            reportFailure()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            reportFailure()
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if ArticleWebURL.decision(for: navigationAction.request.url) == .allow, let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }

        private func reportFailure() {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadFailed = true
            }
        }
    }
}
