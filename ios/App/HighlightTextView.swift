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
        case .purple: return .systemPurple
        case .orange: return .systemOrange
        case .red: return .systemRed
        case .gray: return .systemGray
        }
    }
}

/// Native selection plus a Highlight action in the standard copy/select menu.
struct HighlightTextView: UIViewRepresentable {
    let articleID: String
    let text: String
    let highlights: [Highlight]
    let fontSize: Double
    let activeRange: NSRange?
    let wordRange: NSRange?
    var followToken: Int = 0
    var readingEnabled = true
    var positionLoaded = false
    var restorePosition: ReadingPosition? = nil
    var onFollowVisibilityChange: (SpokenTextFollowVisibility) -> Void = { _ in }
    var onReadingProgressChange: (Double) -> Void = { _ in }
    var onReadingPositionChange: (ReadingPosition) -> Void = { _ in }
    let play: (Int) -> Void
    let save: (NSRange) -> Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = ReaderTextView(usingTextLayoutManager: false)
        context.coordinator.textView = view
        view.onLayout = { [weak coordinator = context.coordinator] in coordinator?.requestUpdate() }
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
        // Read the environment so SwiftUI updates the attributed text when Dynamic Type changes.
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
        let baseFont = UIFont(name: "Georgia", size: fontSize) ?? .systemFont(ofSize: fontSize)
        let font = UIFontMetrics(forTextStyle: .body).scaledFont(for: baseFont, compatibleWith: traits)
        context.coordinator.update(self, font: font, darkMode: colorScheme == .dark)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return context.coordinator.textSize(in: uiView, width: width)
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate, @preconcurrency UIEditMenuInteractionDelegate {
        var parent: HighlightTextView
        weak var menu: UIEditMenuInteraction?
        weak var selectedView: UITextView?
        weak var textView: UITextView?
        var paragraphSelection: NSRange?
        private struct Layout: Equatable {
            let boundsSize: CGSize
            let contentHeight: CGFloat
            let insets: UIEdgeInsets
            let textFrame: CGRect

            var range: (min: CGFloat, max: CGFloat) {
                ReadingProgress.scrollRange(
                    contentHeight: contentHeight,
                    boundsHeight: boundsSize.height,
                    topInset: insets.top,
                    bottomInset: insets.bottom
                )
            }

            func movesText(comparedTo previous: Self) -> Bool {
                boundsSize.width != previous.boundsSize.width || insets.top != previous.insets.top
                    || textFrame != previous.textFrame
            }
        }

        private struct SpokenJump {
            let range: NSRange
            var target: CGFloat?
        }

        private var baseText: NSAttributedString?
        private var renderedFont: UIFont?
        private var renderedDarkMode = false
        private var contentHash = ""
        private var fittedText: CGSize?
        private var fitWidth: CGFloat?
        private var lastFollowToken: Int
        private var spokenJump: SpokenJump?
        private var lastVisibility: SpokenTextFollowVisibility?
        private var lastProgress: Double?
        private var observations: [NSKeyValueObservation] = []
        private weak var observedScroll: UIScrollView?
        private var updateQueued = false
        private var offsetChanged = false
        private var userScrolled = false
        private var settingOffset = false
        private var lastOffsetY: CGFloat?
        private var lastLayout: Layout?
        private var needsReanchor = false
        private var resumingReader = false
        private var didInitialRestore = false
        private var readingAnchor: ReadingPosition?

        init(_ parent: HighlightTextView) {
            self.parent = parent
            lastFollowToken = parent.followToken
        }

        func update(_ next: HighlightTextView, font: UIFont, darkMode: Bool) {
            guard let textView else { return }
            let textChanged = baseText == nil || !ReadingProgress.matchesText(parent.text, next.text)
            let fontChanged = renderedFont != font
            let styleChanged = textChanged || fontChanged || renderedDarkMode != darkMode
                || parent.highlights != next.highlights
            let speechChanged = parent.activeRange != next.activeRange || parent.wordRange != next.wordRange

            if textChanged {
                contentHash = Highlight.contentHash(next.text)
                spokenJump = nil
            }
            if textChanged || fontChanged {
                needsReanchor = true
                fittedText = nil
            }
            if parent.readingEnabled != next.readingEnabled {
                resumingReader = next.readingEnabled
                offsetChanged = false
                userScrolled = false
                spokenJump = nil
            }
            parent = next

            if styleChanged {
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineSpacing = 7
                let attributed = NSMutableAttributedString(
                    string: next.text,
                    attributes: [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph]
                )
                for highlight in next.highlights {
                    guard let range = highlight.range(in: next.text) else { continue }
                    attributed.addAttribute(
                        .backgroundColor,
                        value: highlight.color.uiColor.withAlphaComponent(darkMode ? 0.38 : 0.3),
                        range: range
                    )
                }
                baseText = attributed
                renderedFont = font
                renderedDarkMode = darkMode
            }
            if (styleChanged || speechChanged), let baseText {
                let attributed = NSMutableAttributedString(attributedString: baseText)
                for (range, opacity) in [(next.activeRange, 0.12), (next.wordRange, 0.32)] {
                    if let range, range.location >= 0, range.length > 0, NSMaxRange(range) <= attributed.length {
                        attributed.addAttribute(.backgroundColor, value: UIColor.systemIndigo.withAlphaComponent(opacity), range: range)
                    }
                }
                let selection = textView.selectedRange
                textView.attributedText = attributed
                if selection.location <= attributed.length && selection.length <= attributed.length - selection.location {
                    textView.selectedRange = selection
                }
            }

            if lastFollowToken != next.followToken {
                lastFollowToken = next.followToken
                spokenJump = spokenRange().map { SpokenJump(range: $0) }
            }
            requestUpdate()
        }

        func textSize(in textView: UITextView, width: CGFloat) -> CGSize {
            if fitWidth == width, let fittedText { return fittedText }
            let size = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
            fitWidth = width
            fittedText = size
            return size
        }

        private func observe(_ scroll: UIScrollView) {
            guard observedScroll !== scroll else { return }
            observedScroll = scroll
            lastLayout = nil
            lastOffsetY = nil
            offsetChanged = false
            userScrolled = false
            needsReanchor = true
            observations = [
                scroll.observe(\.contentOffset, options: [.old, .new]) { [weak self] scroll, change in
                    guard change.oldValue?.y != change.newValue?.y else { return }
                    MainActor.assumeIsolated {
                        guard let self, self.observedScroll === scroll, !self.settingOffset else { return }
                        self.offsetChanged = true
                        self.userScrolled = self.userScrolled || scroll.isTracking || scroll.isDragging || scroll.isDecelerating
                        self.requestUpdate()
                    }
                },
                scroll.observe(\.contentSize) { [weak self] _, _ in
                    MainActor.assumeIsolated { self?.requestUpdate() }
                },
                scroll.observe(\.adjustedContentInset) { [weak self] _, _ in
                    MainActor.assumeIsolated { self?.requestUpdate() }
                },
                scroll.observe(\.bounds, options: [.old, .new]) { [weak self] _, change in
                    guard change.oldValue?.size != change.newValue?.size else { return }
                    MainActor.assumeIsolated { self?.requestUpdate() }
                }
            ]
        }

        func requestUpdate() {
            guard !updateQueued else { return }
            updateQueued = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.updateQueued = false
                self.updateScroll()
            }
        }

        private func updateScroll() {
            guard let textView, textView.window != nil, let scroll = enclosingScrollView(from: textView) else { return }
            observe(scroll)
            guard parent.readingEnabled else {
                publish(.hidden)
                return
            }
            guard baseText != nil, textView.bounds.width > 0, scroll.bounds.height > 0 else { return }
            textView.layoutIfNeeded()
            let layout = Layout(
                boundsSize: scroll.bounds.size,
                contentHeight: scroll.contentSize.height,
                insets: scroll.adjustedContentInset,
                textFrame: textView.convert(textView.bounds, to: scroll)
            )
            let fittedHeight = textSize(in: textView, width: textView.bounds.width).height
            guard ReadingProgress.layoutMatches(textFrame: layout.textFrame, fittedHeight: fittedHeight, contentHeight: layout.contentHeight) else { return }

            let moved = offsetChanged && lastOffsetY != scroll.contentOffset.y
            let movedByUser = moved && userScrolled
            offsetChanged = false
            userScrolled = false
            defer { lastOffsetY = scroll.contentOffset.y }
            let layoutChanged = layout != lastLayout
            let initialRestore = parent.positionLoaded && !didInitialRestore
            if initialRestore {
                readingAnchor = parent.restorePosition.flatMap { $0.articleId == parent.articleID ? $0 : nil }
                didInitialRestore = true
            }
            let textMoved = lastLayout.map { layout.movesText(comparedTo: $0) } ?? true
            // Bottom chrome can resize the viewport without moving the text. Reapply
            // a bottom or fractional anchor when its scroll range changes.
            let usesScrollRange = readingAnchor.map { $0.progress == 1 || $0.contentHash != contentHash } ?? false
            let reanchor = needsReanchor || textMoved || (layoutChanged && usesScrollRange)
            let resumeOffset = resumingReader ? lastOffsetY : nil
            resumingReader = false
            needsReanchor = false
            lastLayout = layout

            // An explicit jump takes precedence over restoring the old reading anchor.
            if scroll.isTracking || scroll.isDragging {
                spokenJump = nil
            }
            if let jump = spokenJump, let rect = spokenRect(for: jump.range, in: textView) {
                let finished = follow(rect: rect, in: textView, scroll: scroll, layout: layout, layoutChanged: layoutChanged || reanchor)
                if finished && didInitialRestore {
                    capturePosition(in: textView, scroll: scroll, layout: layout)
                }
            } else if initialRestore || (reanchor && !movedByUser) {
                restore(in: textView, scroll: scroll, layout: layout)
            } else if let resumeOffset, !movedByUser {
                let range = layout.range
                setOffset(min(max(resumeOffset, range.min), range.max), in: scroll, animated: false)
            } else if didInitialRestore && moved && (!layoutChanged || movedByUser) {
                capturePosition(in: textView, scroll: scroll, layout: layout)
            }

            publishProgress(scroll: scroll, layout: layout)
            publishVisibility(in: textView, scroll: scroll, layout: layout)
        }

        private func restore(in textView: UITextView, scroll: UIScrollView, layout: Layout) {
            guard let readingAnchor, let anchor = ReadingProgress.resolve(
                saved: readingAnchor,
                currentHash: contentHash,
                utf16Count: textView.attributedText.length
            ) else { return }
            let range = layout.range
            let target: CGFloat
            switch anchor {
            case .utf16Offset(let offset):
                let manager = textView.layoutManager
                let glyph = manager.glyphIndexForCharacter(at: offset)
                guard glyph < manager.numberOfGlyphs else { return }
                let line = manager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
                    .offsetBy(dx: textView.textContainerInset.left, dy: textView.textContainerInset.top)
                target = ReadingProgress.targetOffsetY(
                    anchorMinYInScrollContent: textView.convert(line, to: scroll).minY,
                    topInset: layout.insets.top,
                    minOffsetY: range.min,
                    maxOffsetY: range.max
                )
            case .fraction(let fraction):
                target = ReadingProgress.offsetY(progress: fraction, minOffsetY: range.min, maxOffsetY: range.max)
            }
            setOffset(target, in: scroll, animated: false)
        }

        private func setOffset(_ target: CGFloat, in scroll: UIScrollView, animated: Bool) {
            guard abs(scroll.contentOffset.y - target) >= 0.5 else { return }
            // UIKit notifies KVO during the assignment. Suppress that event before
            // queuing scroll work, and handle animated jumps until they reach their target.
            settingOffset = true
            defer { settingOffset = false }
            scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: target), animated: animated)
        }

        private func capturePosition(in textView: UITextView, scroll: UIScrollView, layout: Layout) {
            let range = layout.range
            guard range.max > range.min else { return }
            // Sample the first visible line. Its width can change during reflow.
            let point = scroll.convert(CGPoint(
                x: layout.textFrame.minX + textView.textContainerInset.left,
                y: scroll.bounds.minY + layout.insets.top + ReadingProgress.restoreContextAbove
            ), to: textView)
            let containerPoint = CGPoint(
                x: point.x - textView.textContainerInset.left,
                y: point.y - textView.textContainerInset.top
            )
            let offset = textView.layoutManager.characterIndex(
                for: containerPoint,
                in: textView.textContainer,
                fractionOfDistanceBetweenInsertionPoints: nil
            )
            let position = ReadingPosition(
                articleId: parent.articleID,
                contentHash: contentHash,
                utf16Offset: ReadingProgress.clampedUTF16Offset(offset, count: textView.attributedText.length),
                progress: ReadingProgress.progress(offsetY: scroll.contentOffset.y, minOffsetY: range.min, maxOffsetY: range.max)
            )
            guard ReadingProgress.isMeaningfulChange(position, from: readingAnchor) else { return }
            readingAnchor = position
            parent.onReadingPositionChange(position)
        }

        private func publishProgress(scroll: UIScrollView, layout: Layout) {
            let range = layout.range
            let progress = ReadingProgress.progress(offsetY: scroll.contentOffset.y, minOffsetY: range.min, maxOffsetY: range.max)
            if let lastProgress, !ReadingProgress.progressChanged(progress, from: lastProgress) { return }
            lastProgress = progress
            parent.onReadingProgressChange(progress)
        }

        private func publishVisibility(in textView: UITextView, scroll: UIScrollView, layout: Layout) {
            guard let range = spokenRange(), let rect = spokenRect(for: range, in: textView) else {
                publish(.hidden)
                return
            }
            let rectInScroll = textView.convert(rect, to: scroll)
            let visible = scroll.bounds.inset(by: layout.insets)
            publish(SpokenTextScroll.visibility(spokenRectInVisibleBounds: rectInScroll, visibleBounds: visible))
        }

        private func follow(rect: CGRect, in textView: UITextView, scroll: UIScrollView, layout: Layout, layoutChanged: Bool) -> Bool {
            if spokenJump?.target == nil || layoutChanged {
                let range = layout.range
                let target = SpokenTextScroll.targetOffsetY(
                    spokenMinYInScrollContent: textView.convert(rect, to: scroll).minY,
                    topInset: layout.insets.top,
                    minOffsetY: range.min,
                    maxOffsetY: range.max
                )
                let animate = spokenJump?.target == nil
                spokenJump?.target = target
                setOffset(target, in: scroll, animated: animate)
            }
            guard let target = spokenJump?.target, abs(scroll.contentOffset.y - target) < 0.5 else { return false }
            spokenJump = nil
            return true
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
            parent.onFollowVisibilityChange(visibility)
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

private final class ReaderTextView: UITextView {
    var onLayout: (() -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        onLayout?()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        onLayout?()
    }
}
