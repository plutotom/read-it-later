/**
 * Article extraction service
 * Extracts clean, readable content from web articles
 */

import type { ArticleExtractionResult } from "~/types/article";

export class ArticleExtractor {
  /**
   * Extract article content from a URL
   */
  static async extractFromUrl(url: string): Promise<ArticleExtractionResult> {
    try {
      // Validate URL
      const urlObj = new URL(url);

      // Fetch the HTML content
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ReadItLater/1.0)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch article: ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();
      const extracted = this.parseHtml(html, url);

      return extracted;
    } catch (error) {
      console.error("Error extracting article:", error);

      // Return fallback data on error
      return this.getFallbackData(url);
    }
  }

  /**
   * Parse HTML content and extract article data
   * This is a simplified implementation - in production, you'd use a library like Readability.js
   */
  private static parseHtml(html: string, url: string): ArticleExtractionResult {
    const urlObj = new URL(url);

    // Basic HTML parsing using regex (not recommended for production)
    // In a real app, you'd use a proper HTML parser and Readability algorithm

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    );
    const title =
      ogTitleMatch?.[1] || titleMatch?.[1] || `Article from ${urlObj.hostname}`;

    // Extract description/excerpt
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    );
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    );
    const excerpt = ogDescMatch?.[1] || descMatch?.[1];

    // Extract author
    const authorMatch = html.match(
      /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
    );
    const author = authorMatch?.[1];

    // Extract published date
    let publishedAt: Date | undefined;
    const dateMatch = html.match(
      /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    );
    if (dateMatch?.[1]) {
      publishedAt = new Date(dateMatch[1]);
    }

    // Extract main content (very basic extraction)
    // Remove scripts, styles, and navigation
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

    // Try to find main content area
    const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    if (articleMatch?.[1]) {
      content = articleMatch[1];
    } else if (mainMatch?.[1]) {
      content = mainMatch[1];
    }

    // Clean up HTML tags (basic cleaning)
    content = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Fallback if content is too short
    if (content.length < 100) {
      content = `Extracted content from ${url}. This is a simplified extraction - for production use, integrate with a proper article extraction service like Mercury or Readability.`;
    }

    // Calculate word count and reading time
    const words = content.split(/\s+/).filter((word) => word.length > 0);
    const wordCount = words.length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Average reading speed

    // Extract metadata
    const siteNameMatch = html.match(
      /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
    );
    const imageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    );
    const languageMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);

    return {
      title: this.cleanText(title),
      content: this.cleanText(content),
      excerpt: excerpt ? this.cleanText(excerpt) : undefined,
      author: author ? this.cleanText(author) : undefined,
      publishedAt: publishedAt || undefined,
      wordCount,
      readingTime,
      metadata: {
        siteName: siteNameMatch?.[1]
          ? this.cleanText(siteNameMatch[1])
          : urlObj.hostname,
        siteUrl: urlObj.origin,
        description: excerpt ? this.cleanText(excerpt) : undefined,
        imageUrl: imageMatch?.[1],
        language: languageMatch?.[1],
      },
    };
  }

  /**
   * Get fallback data when extraction fails
   */
  private static getFallbackData(url: string): ArticleExtractionResult {
    const urlObj = new URL(url);

    return {
      title: `Article from ${urlObj.hostname}`,
      content: `Content extraction failed for ${url}. The article is available at the original URL.`,
      excerpt: `Preview of article from ${urlObj.hostname}`,
      author: undefined,
      publishedAt: undefined,
      wordCount: 20,
      readingTime: 1,
      metadata: {
        siteName: urlObj.hostname,
        siteUrl: urlObj.origin,
        description: `Article from ${urlObj.hostname}`,
      },
    };
  }

  /**
   * Clean extracted text
   */
  private static cleanText(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Validate if URL is accessible
   */
  static async validateUrl(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);

      // Basic checks
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }

      // Try to fetch headers only
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ReadItLater/1.0)",
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export convenience function
export async function extractArticleContent(
  url: string,
): Promise<ArticleExtractionResult> {
  return ArticleExtractor.extractFromUrl(url);
}
