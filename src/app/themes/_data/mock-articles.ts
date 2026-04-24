/**
 * Mock article data shared across theme preview pages. Each theme re-themes
 * the copy slightly, but the shape stays consistent so structural choices
 * (cards, lists, metadata) can be compared apples-to-apples.
 */
export interface MockArticle {
  id: string;
  title: string;
  excerpt: string;
  domain: string;
  author: string;
  readingTime: number;
  savedAgo: string;
  tags: string[];
  /** Full mock body as an array of paragraphs. Rendered by theme-specific
   * reading views so we can compare typography treatments on identical prose. */
  body?: string[];
  pullQuote?: string;
}

export const MOCK_ARTICLES: MockArticle[] = [
  {
    id: "1",
    title: "The slow web, and why it still matters in 2026",
    excerpt:
      "Against the tyranny of the feed: a case for essays, for permalinks, and for reading something that was written to be finished, not scrolled.",
    domain: "ribbonfarm.com",
    author: "Venkatesh Rao",
    readingTime: 14,
    savedAgo: "2h ago",
    tags: ["essay", "internet"],
    pullQuote:
      "A well-written essay is not content. It is a small, deliberate room someone built for you to sit in.",
    body: [
      "There is a way of being on the internet that almost no one practices anymore, and yet everyone quietly misses. You remember it: a long page, a byline, a photo that loaded in pieces, and the sense — unusual now — that someone had finished something and put it down in front of you.",
      "The feed has replaced the page. This is the essential shift, and every complaint about the modern web descends from it. A feed is a river. A page is a room. You do not have conversations in a river. You do not sleep there, or think there, or change your mind there. You only drift.",
      "I want to make a small, stubborn case for the page. Not as nostalgia — the old web was clunky and often ugly, and I am not longing to hand-code a guestbook. The case is functional. Pages accumulate. They can be linked. They can be cited. They can be, in the best moments, returned to. A good page is a small architectural fact in your life. A feed is weather.",
      "The slow web is what you get when you design for the page instead of the feed. It is permalinks over timelines. Essays over threads. Table of contents over infinite scroll. Reading over skimming. Finishing over bookmarking forever. It costs its writers more and rewards its readers more, which is an unpopular trade in 2026 but a correct one.",
      "A well-written essay is not content. It is a small, deliberate room someone built for you to sit in. Someone chose the window, the chair, the quality of the afternoon light. The only reasonable response is to sit down and stay a while. That is what reading used to mean, and what — if we are a little careful — it can mean again.",
      "I save articles. I read the ones I save. This is not a revolutionary act. But some weeks it feels like one.",
    ],
  },
  {
    id: "2",
    title: "How a single CSS variable rewired how I design color",
    excerpt:
      "A year of shipping themable products taught me that tokens are not decoration. They are the grammar of your interface.",
    domain: "lea.verou.me",
    author: "Lea Verou",
    readingTime: 9,
    savedAgo: "6h ago",
    tags: ["css", "design"],
  },
  {
    id: "3",
    title: "Notes on the great cartographers of the pacific",
    excerpt:
      "Before satellites, Polynesian wayfinders read the swell of the ocean like a braille map. What we lost when we forgot how to feel a current.",
    domain: "lrb.co.uk",
    author: "Hua Hsu",
    readingTime: 22,
    savedAgo: "yesterday",
    tags: ["history", "longform"],
  },
  {
    id: "4",
    title: "The case against microservices, revisited",
    excerpt:
      "Ten years after the pattern took over, a rare honest autopsy from an engineer who shipped (and later deleted) seventeen of them.",
    domain: "martinfowler.com",
    author: "Martin Fowler",
    readingTime: 18,
    savedAgo: "2d ago",
    tags: ["software", "architecture"],
  },
  {
    id: "5",
    title: "On learning to bake bread in a broken kitchen",
    excerpt:
      "A love letter to wet dough, impatience, and the specific humility of a loaf that simply refuses to rise on the day you needed it to.",
    domain: "cupofjo.com",
    author: "Joanna Goddard",
    readingTime: 6,
    savedAgo: "3d ago",
    tags: ["food", "memoir"],
  },
  {
    id: "6",
    title: "A field guide to the new melancholy",
    excerpt:
      "Why is everyone so tired, so online, so tender? Five critics assemble a lexicon for the mood of late-stage everything.",
    domain: "dirt.fyi",
    author: "Daisy Alioto",
    readingTime: 11,
    savedAgo: "last week",
    tags: ["culture", "criticism"],
  },
] as const;

export const MOCK_FOLDERS = [
  { id: "inbox", label: "Inbox", count: 28 },
  { id: "unread", label: "Unread", count: 14 },
  { id: "favorites", label: "Favorites", count: 9 },
  { id: "archive", label: "Archive", count: 217 },
] as const;

export const MOCK_TAGS = [
  "essay",
  "design",
  "longform",
  "software",
  "culture",
  "history",
  "food",
  "criticism",
] as const;
