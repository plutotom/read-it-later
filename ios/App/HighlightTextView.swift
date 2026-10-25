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
    let activeRange: NSRange?
    let wordRange: NSRange?
    var followToken: Int = 0
    var onFollowVisibilityChange: (SpokenTextFollowVisibility) -> Void = { _ in }
    let play: (Int) -> Void
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
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.selectParagraph(_:)))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        let menu = UIEditMenuInteraction(delegate: context.coordinator)
        view.addInteraction(menu)
        context.coordinator.menu = menu
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.textView = view
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 7
        let font = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont(name: "Georgia", size: fontSize) ?? .systemFont(ofSize: fontSize))
        let attributed = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
        for highlight in highlights {
            guard let range = highlight.range(in: text) else { continue }
            attributed.addAttribute(.backgroundColor, value: highlight.color.uiColor.withAlphaComponent(colorScheme == .dark ? 0.38 : 0.3), range: range)
        }
        for (range, opacity) in [(activeRange, 0.12), (wordRange, 0.32)] {
            if let range, range.location >= 0, range.length > 0, NSMaxRange(range) <= attributed.length {
                attributed.addAttribute(.backgroundColor, value: UIColor.systemIndigo.withAlphaComponent(opacity), range: range)
            }
        }
        if !view.attributedText.isEqual(to: attributed) {
            let selection = view.selectedRange
            view.attributedText = attributed
            if selection.location <= attributed.length && selection.length <= attributed.length - selection.location { view.selectedRange = selection }
        }
        context.coordinator.observeEnclosingScrollView(from: view)
        context.coordinator.publishVisibility()
        if context.coordinator.lastFollowToken != followToken {
            context.coordinator.lastFollowToken = followToken
            if followToken > 0 { context.coordinator.scrollSpokenTextIntoView() }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate, @preconcurrency UIEditMenuInteractionDelegate {
        var parent: HighlightTextView
        weak var menu: UIEditMenuInteraction?
        weak var selectedView: UITextView?
        weak var textView: UITextView?
        var paragraphSelection: NSRange?
        var lastFollowToken = 0
        private var lastVisibility: SpokenTextFollowVisibility?
        private var scrollObservation: NSKeyValueObservation?
        private weak var observedScroll: UIScrollView?
        init(_ parent: HighlightTextView) { self.parent = parent }
        deinit { scrollObservation?.invalidate() }

        func observeEnclosingScrollView(from view: UIView) {
            guard let scroll = enclosingScrollView(from: view) else { return }
            if observedScroll === scroll { return }
            scrollObservation?.invalidate()
            observedScroll = scroll
            scrollObservation = scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
                DispatchQueue.main.async { self?.publishVisibility() }
            }
        }

        func publishVisibility() {
            guard let textView else { publish(.hidden); return }
            textView.layoutIfNeeded()
            guard let range = spokenRange() else { publish(.hidden); return }
            guard let scroll = enclosingScrollView(from: textView),
                  let rect = spokenRect(for: range, in: textView) else {
                publish(.hidden)
                return
            }
            let rectInScroll = textView.convert(rect, to: scroll)
            let visible = scroll.bounds.inset(by: scroll.adjustedContentInset)
            publish(SpokenTextScroll.visibility(spokenRectInVisibleBounds: rectInScroll, visibleBounds: visible))
        }

        func scrollSpokenTextIntoView() {
            guard let textView, let range = spokenRange(),
                  let scroll = enclosingScrollView(from: textView) else { return }
            textView.layoutIfNeeded()
            scroll.layoutIfNeeded()
            guard let rect = spokenRect(for: range, in: textView) else { return }
            let rectInScroll = textView.convert(rect, to: scroll)
            let minOffset = -scroll.adjustedContentInset.top
            let maxOffset = max(minOffset, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
            let target = SpokenTextScroll.targetOffsetY(
                spokenMinYInScrollContent: rectInScroll.minY,
                topInset: scroll.adjustedContentInset.top,
                minOffsetY: minOffset,
                maxOffsetY: maxOffset
            )
            scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: target), animated: true)
        }

        private func spokenRange() -> NSRange? {
            SpokenTextScroll.anchor(wordRange: parent.wordRange, chunkRange: parent.activeRange)?.range
        }

        private func spokenRect(for range: NSRange, in textView: UITextView) -> CGRect? {
            let length = textView.attributedText?.length ?? 0
            guard range.location >= 0, range.location <= length else { return nil }
            let safeLength = min(max(range.length, 1), max(0, length - range.location))
            guard let start = textView.position(from: textView.beginningOfDocument, offset: range.location),
                  let end = textView.position(from: start, offset: safeLength),
                  let textRange = textView.textRange(from: start, to: end) else { return nil }
            let rect = textView.firstRect(for: textRange)
            if rect.isNull || rect.isInfinite { return textView.caretRect(for: start) }
            return rect
        }

        private func enclosingScrollView(from view: UIView) -> UIScrollView? {
            var current = view.superview
            while let candidate = current {
                if let scroll = candidate as? UIScrollView, scroll !== view { return scroll }
                current = candidate.superview
            }
            return nil
        }

        private func publish(_ visibility: SpokenTextFollowVisibility) {
            guard visibility != lastVisibility else { return }
            lastVisibility = visibility
            DispatchQueue.main.async { [parent] in parent.onFollowVisibilityChange(visibility) }
        }

        @objc func selectParagraph(_ gesture: UITapGestureRecognizer) {
            guard let view = gesture.view as? UITextView else { return }
            let point = gesture.location(in: view)
            let containerPoint = CGPoint(x: point.x - view.textContainerInset.left, y: point.y - view.textContainerInset.top)
            guard view.layoutManager.usedRect(for: view.textContainer).contains(containerPoint) else { return }
            let offset = view.layoutManager.characterIndex(for: containerPoint, in: view.textContainer, fractionOfDistanceBetweenInsertionPoints: nil)
            let document = ListeningDocument(articleID: "selection", title: "", text: parent.text)
            guard let index = document.chunk(atUTF16Offset: offset) else { return }
            let range = document.paragraphs[document.chunks[index].paragraph]
            selectedView = view; paragraphSelection = range
            view.becomeFirstResponder(); view.selectedRange = range
            menu?.presentEditMenu(with: UIEditMenuConfiguration(identifier: nil, sourcePoint: point))
        }

        func editMenuInteraction(_ interaction: UIEditMenuInteraction, menuFor configuration: UIEditMenuConfiguration, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard let range = paragraphSelection else { return nil }
            return UIMenu(children: actions(for: range, in: selectedView) + suggestedActions)
        }

        private func actions(for range: NSRange, in textView: UITextView?) -> [UIMenuElement] {
            let play = UIAction(title: "Play from paragraph", image: UIImage(systemName: "play.fill")) { [weak self, weak textView] _ in
                self?.parent.play(range.location)
                textView?.selectedRange = NSRange(location: range.location, length: 0)
            }
            let highlight = UIAction(title: "Highlight", image: UIImage(systemName: "highlighter")) { [weak self, weak textView] _ in
                guard let self else { return }
                if self.parent.save(range) { textView?.selectedRange = NSRange(location: range.location, length: 0) }
            }
            return [play, highlight]
        }

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard range.length > 0 else { return UIMenu(children: suggestedActions) }
            return UIMenu(children: actions(for: range, in: textView) + suggestedActions)
        }
    }
}
