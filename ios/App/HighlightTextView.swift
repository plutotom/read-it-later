import SwiftUI
import UIKit
import ReadingCore

extension HighlightColor {
    var uiColor: UIColor {
        switch self {
        case .yellow: return .systemYellow
        case .green: return .systemGreen
        case .blue: return .systemBlue
        case .pink: return .systemPink
        }
    }
}

/// Native selection plus a Highlight action in the standard copy/select menu.
struct HighlightTextView: UIViewRepresentable {
    let text: String
    let highlights: [Highlight]
    let fontSize: Double
    let save: (NSRange) -> Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.adjustsFontForContentSizeCategory = true
        view.accessibilityIdentifier = "articleText"
        view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 7
        let font = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont(name: "Georgia", size: fontSize) ?? .systemFont(ofSize: fontSize))
        let attributed = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
        for highlight in highlights {
            guard let range = highlight.range(in: text) else { continue }
            attributed.addAttribute(.backgroundColor, value: highlight.color.uiColor.withAlphaComponent(colorScheme == .dark ? 0.38 : 0.3), range: range)
        }
        if !view.attributedText.isEqual(to: attributed) {
            let selection = view.selectedRange
            view.attributedText = attributed
            if selection.location <= attributed.length && selection.length <= attributed.length - selection.location { view.selectedRange = selection }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate {
        var parent: HighlightTextView
        init(_ parent: HighlightTextView) { self.parent = parent }

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard range.length > 0 else { return UIMenu(children: suggestedActions) }
            let action = UIAction(title: "Highlight", image: UIImage(systemName: "highlighter")) { [weak self, weak textView] _ in
                guard let self else { return }
                if self.parent.save(range) { textView?.selectedRange = NSRange(location: range.location, length: 0) }
            }
            return UIMenu(children: [action] + suggestedActions)
        }
    }
}
