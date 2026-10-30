import SwiftUI
import UIKit
import ReadingCore

enum ArticleLinkPasteboard {
    static func copy(_ article: Article) {
        if let url = ArticleContextAction.shareURL(for: article) {
            UIPasteboard.general.url = url
        } else {
            UIPasteboard.general.string = ArticleContextAction.copyLinkValue(for: article)
        }
    }
}

extension View {
    func articleContextMenu(article: Article, onDelete: @escaping () -> Void) -> some View {
        contextMenu {
            if let url = ArticleContextAction.shareURL(for: article) {
                ShareLink(item: url) {
                    Label(ArticleContextAction.share.title, systemImage: ArticleContextAction.share.systemImage)
                }
                .accessibilityLabel(ArticleContextAction.share.accessibilityLabel)
                .accessibilityIdentifier("articleContextShare")
                Button {
                    ArticleLinkPasteboard.copy(article)
                } label: {
                    Label(ArticleContextAction.copyLink.title, systemImage: ArticleContextAction.copyLink.systemImage)
                }
                .accessibilityLabel(ArticleContextAction.copyLink.accessibilityLabel)
                .accessibilityIdentifier("articleContextCopyLink")
                Divider()
            }
            Button(role: .destructive, action: onDelete) {
                Label(ArticleContextAction.delete.title, systemImage: ArticleContextAction.delete.systemImage)
            }
            .accessibilityLabel(ArticleContextAction.delete.accessibilityLabel)
            .accessibilityIdentifier("articleContextDelete")
        }
    }
}
