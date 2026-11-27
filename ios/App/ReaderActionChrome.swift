import SwiftUI
import ReadingCore

struct ReaderActionBar: View {
    let context: ReaderActionCatalog.Context
    let shareURL: URL?
    let menuOpen: Bool
    var onBack: () -> Void
    var onToggleMenu: () -> Void
    var onAction: (ReaderActionCatalog.Kind) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 12) {
                backButton
                Spacer(minLength: 8)
                capsule
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Spacer(minLength: 0)
                    capsule
                }
                backButton
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 6)
    }

    private var backButton: some View {
        Button(action: onBack) {
            Image(systemName: "chevron.left")
                .font(.body.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .background(.regularMaterial, in: Circle())
                .overlay(Circle().stroke(.primary.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Paper Drive")
        .accessibilityHint("Returns to your library")
        .accessibilityIdentifier("readerBack")
    }

    private var capsule: some View {
        HStack(spacing: 2) {
            ForEach(ReaderActionCatalog.toolbar(for: context)) { item in
                toolbarButton(item)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().stroke(.primary.opacity(0.08)))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func toolbarButton(_ item: ReaderActionCatalog.Item) -> some View {
        if item.kind == .share, let shareURL {
            ShareLink(item: shareURL) {
                toolbarGlyph(item)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.accessibilityLabel)
            .accessibilityIdentifier(item.accessibilityIdentifier)
        } else if item.kind == .more {
            Button(action: onToggleMenu) {
                toolbarGlyph(item)
                    .foregroundStyle(menuOpen ? Color.accentColor : Color.primary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.accessibilityLabel)
            .accessibilityHint("Shows article actions")
            .accessibilityIdentifier(item.accessibilityIdentifier)
            .accessibilityAddTraits(menuOpen ? .isSelected : [])
        } else {
            Button {
                onAction(item.kind)
            } label: {
                toolbarGlyph(item)
            }
            .buttonStyle(.plain)
            .disabled(item.disabled)
            .accessibilityLabel(item.accessibilityLabel)
            .accessibilityIdentifier(item.accessibilityIdentifier)
        }
    }

    private func toolbarGlyph(_ item: ReaderActionCatalog.Item) -> some View {
        Image(systemName: item.systemImage)
            .font(.body.weight(.semibold))
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .opacity(item.disabled ? 0.4 : 1)
    }
}

struct ReaderOverflowMenu: View {
    let context: ReaderActionCatalog.Context
    let shareURL: URL?
    var onDismiss: () -> Void
    var onAction: (ReaderActionCatalog.Kind) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var cardShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
    }

    var body: some View {
        let groups = ReaderActionCatalog.overflowGroups(for: context)
        let width: CGFloat = dynamicTypeSize.isAccessibilitySize ? 300 : 252
        let rows = VStack(spacing: 0) {
            ForEach(Array(groups.enumerated()), id: \.offset) { index, group in
                VStack(spacing: 0) {
                    ForEach(group) { item in
                        overflowRow(item)
                    }
                }
                if index < groups.count - 1 {
                    Rectangle()
                        .fill(.primary.opacity(0.08))
                        .frame(height: 1 / 3)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(.vertical, 12)
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView(showsIndicators: false) { rows }
                    .frame(maxHeight: 520)
            } else {
                rows
            }
        }
        .frame(width: width)
        .background(.thickMaterial, in: cardShape)
        .overlay(cardShape.stroke(.primary.opacity(0.06)))
        .clipShape(cardShape)
        .shadow(color: .black.opacity(0.16), radius: 24, y: 10)
        .padding(.trailing, 16)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Reading options")
        .accessibilityIdentifier("readerOverflowMenu")
        .transition(reduceMotion ? .opacity : .scale(scale: 0.96, anchor: .bottomTrailing).combined(with: .opacity))
    }

    @ViewBuilder
    private func overflowRow(_ item: ReaderActionCatalog.Item) -> some View {
        if item.kind == .share, let shareURL {
            ShareLink(item: shareURL) {
                overflowLabel(item)
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded(onDismiss))
            .accessibilityLabel(item.accessibilityLabel)
            .accessibilityIdentifier(item.accessibilityIdentifier)
        } else {
            Button {
                onAction(item.kind)
            } label: {
                overflowLabel(item)
            }
            .buttonStyle(.plain)
            .disabled(item.disabled)
            .accessibilityLabel(item.accessibilityLabel)
            .accessibilityIdentifier(item.accessibilityIdentifier)
        }
    }

    private func overflowLabel(_ item: ReaderActionCatalog.Item) -> some View {
        HStack(spacing: 12) {
            Image(systemName: item.systemImage)
                .font(.body)
                .frame(width: 22)
            Text(item.title)
                .font(.body)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .foregroundStyle(item.isDestructive ? Color.red : Color.primary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
        .opacity(item.disabled ? 0.4 : 1)
    }
}
