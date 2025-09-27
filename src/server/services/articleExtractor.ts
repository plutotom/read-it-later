/**
 * Article extraction service using Mozilla Readability
 * Extracts clean, readable content from web articles while preserving structure
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ArticleExtractionResult } from "~/types/article";

export class ArticleExtractor {
  /**
   * Extract article content from a URL using Mozilla Readability
   */
  static async extractFromUrl(url: string): Promise<ArticleExtractionResult> {
    try {
      // Validate URL
      const urlObj = new URL(url);

      // Fetch the HTML content
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ReadItLater/1.0; +https://github.com/mozilla/readability)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch article: ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();
      const extracted = this.parseWithReadability(html, url);

      return extracted;
    } catch (error) {
      console.error("Error extracting article:", error);

      // Return fallback data on error
      return this.getFallbackData(url);
    }
  }

  /**
   * Parse HTML content using Mozilla Readability
   * This preserves article structure while cleaning up unwanted elements
   */
  private static parseWithReadability(
    html: string,
    url: string,
  ): ArticleExtractionResult {
    const urlObj = new URL(url);

    // Create DOM from HTML
    const dom = new JSDOM(html, {
      url: url,
      // Disable scripts and external resources for security
      runScripts: "dangerously",
      resources: "usable",
    });

    const document = dom.window.document;

    // Create Readability instance with optimized settings
    const reader = new Readability(document, {
      debug: false,
      maxElemsToParse: 0, // No limit
      nbTopCandidates: 5,
      charThreshold: 500,
      classesToPreserve: [
        // Preserve important classes that might contain content
        "highlight",
        "quote",
        "blockquote",
        "code",
        "pre",
        "figure",
        "caption",
        "img",
        "image",
        "photo",
        "picture",
        "hero-image",
        "featured-image",
        "content-image",
        "article-image",
        // Preserve link-related classes
        "link",
        "reference",
        "citation",
        "footnote",
        "external-link",
        "internal-link",
        "article-link",
        "content-link",
      ],
      keepClasses: false, // Only keep classes in classesToPreserve
      disableJSONLD: false,
      // Custom serializer to preserve structure
      serializer: (el) => {
        // Clean up the HTML while preserving structure
        return this.cleanHtmlContent((el as Element).innerHTML);
      },
    });

    // Parse the article
    const article = reader.parse();

    if (!article) {
      // Fallback to basic extraction if Readability fails
      return this.fallbackExtraction(html, url);
    }

    // Post-process content to handle <picture> elements and links
    const processedContent = this.processPictureElements(article.content || "");
    const finalContent = this.processLinks(processedContent, urlObj);

    // Calculate word count and reading time from text content
    const wordCount =
      article.length ||
      article.textContent?.split(/\s+/).filter((word) => word.length > 0)
        .length ||
      0;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Average reading speed

    // Extract additional metadata from original HTML
    const metadata = this.extractMetadata(html, urlObj);

    return {
      title: this.cleanText(article.title || "Untitled"),
      content: finalContent, // This is now properly formatted HTML with processed picture elements and links
      excerpt: article.excerpt
        ? this.cleanText(article.excerpt)
        : metadata.description,
      author: article.byline ? this.cleanText(article.byline) : metadata.author,
      publishedAt: article.publishedTime
        ? new Date(article.publishedTime)
        : metadata.publishedAt,
      wordCount,
      readingTime,
      metadata: {
        siteName: article.siteName || metadata.siteName,
        siteUrl: urlObj.origin,
        description: article.excerpt || metadata.description,
        imageUrl: metadata.imageUrl,
        language: article.lang || metadata.language,
      },
    };
  }

  /**
   * Fallback extraction when Readability fails
   */
  private static fallbackExtraction(
    html: string,
    url: string,
  ): ArticleExtractionResult {
    const urlObj = new URL(url);

    // Basic metadata extraction
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    );
    const title =
      ogTitleMatch?.[1] || titleMatch?.[1] || `Article from ${urlObj.hostname}`;

    // Try to extract main content area
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    let content = "";
    if (articleMatch?.[1]) {
      content = this.cleanHtmlContent(articleMatch[1]);
    } else if (mainMatch?.[1]) {
      content = this.cleanHtmlContent(mainMatch[1]);
    } else {
      content = `<p>Content extraction failed for ${url}. The article is available at the original URL.</p>`;
    }

    const wordCount = content
      .replace(/<[^>]*>/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    return {
      title: this.cleanText(title),
      content,
      excerpt: `Preview of article from ${urlObj.hostname}`,
      author: undefined,
      publishedAt: undefined,
      wordCount,
      readingTime,
      metadata: {
        siteName: urlObj.hostname,
        siteUrl: urlObj.origin,
        description: `Article from ${urlObj.hostname}`,
      },
    };
  }

  /**
   * Extract metadata from HTML
   */
  private static extractMetadata(html: string, urlObj: URL) {
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    );
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    );
    const authorMatch = html.match(
      /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
    );
    const siteNameMatch = html.match(
      /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
    );
    const imageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    );
    const languageMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);

    let publishedAt: Date | undefined;
    const dateMatch = html.match(
      /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    );
    if (dateMatch?.[1]) {
      publishedAt = new Date(dateMatch[1]);
    }

    return {
      description: ogDescMatch?.[1] || descMatch?.[1],
      author: authorMatch?.[1],
      siteName: siteNameMatch?.[1] || urlObj.hostname,
      imageUrl: imageMatch?.[1],
      language: languageMatch?.[1],
      publishedAt,
    };
  }

  /**
   * Process <picture> elements to convert them to regular <img> tags
   * This ensures images display properly in the article reader
   */
  private static processPictureElements(html: string): string {
    // Create a temporary DOM to process the HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Find all <picture> elements
    const pictureElements = document.querySelectorAll("picture");

    pictureElements.forEach((picture) => {
      // Find the fallback <img> tag inside the <picture> element
      const img = picture.querySelector("img");

      if (img) {
        // Create a new <img> element with the same attributes
        const newImg = document.createElement("img");

        // Copy all attributes from the original img
        Array.from(img.attributes).forEach((attr) => {
          newImg.setAttribute(attr.name, attr.value);
        });

        // Replace the <picture> element with the <img> element
        picture.parentNode?.replaceChild(newImg, picture);
      } else {
        // If no <img> found, remove the <picture> element entirely
        picture.remove();
      }
    });

    return document.body.innerHTML;
  }

  /**
   * Process links to ensure they have proper absolute URLs and are preserved
   * This ensures reference links and citations remain clickable
   */
  private static processLinks(html: string, baseUrl: URL): string {
    // Create a temporary DOM to process the HTML
    const dom = new JSDOM(html, { url: baseUrl.href });
    const document = dom.window.document;

    // Find all <a> elements
    const links = document.querySelectorAll("a");

    links.forEach((link) => {
      const href = link.getAttribute("href");

      if (href) {
        try {
          // Convert relative URLs to absolute URLs
          const absoluteUrl = new URL(href, baseUrl.href).href;
          link.setAttribute("href", absoluteUrl);

          // Ensure links open in new tab for external references
          if (!link.getAttribute("target")) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
          }

          // Add visual indicator for external links and general link class
          const existingClass = link.getAttribute("class") || "";
          let newClass = `${existingClass} article-link`.trim();

          if (!href.startsWith("#") && !href.startsWith(baseUrl.origin)) {
            newClass += " external-link";
          }

          link.setAttribute("class", newClass);
        } catch (error) {
          // If URL is invalid, remove the href but keep the text
          console.warn("Invalid URL in link:", href);
          link.removeAttribute("href");
        }
      }
    });

    return document.body.innerHTML;
  }

  /**
   * Clean HTML content while preserving structure
   */
  private static cleanHtmlContent(html: string): string {
    return (
      html
        // Remove script and style tags
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        // Remove unwanted elements
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
        // Clean up excessive whitespace but preserve structure
        .replace(/\s+/g, " ")
        .replace(/>\s+</g, "><")
        .trim()
    );
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
