/**
 * The blog's post registry: the index page, the sitemap and each post's
 * metadata all read from here, so a post is added in one place.
 *
 * Every post exists to answer one search question and hand her to /register.
 */

/**
 * The origin search engines should index. Hardcoded rather than read from
 * NEXT_PUBLIC_SITE_URL: that variable is `http://localhost:3000` locally, and
 * the apex (`menolisa.com`) 307s to `www` - a canonical URL that redirects is
 * one Google discounts. `www` is the host that answers 200.
 */
export const CANONICAL_ORIGIN = "https://www.menolisa.com";

export type BlogAuthor = {
  name: string;
  /** Who she is, stated as the paywall states it - never a credential. */
  role: string;
  photo: string;
};

/**
 * Zoka came up with MenoLisa. She is not a clinician, and nothing on the blog
 * may say or imply she is (CLAUDE.md, "Invent an expert ... or credential").
 */
export const ZOKA: BlogAuthor = {
  name: "Zoka",
  role: "Came up with MenoLisa",
  photo: "/proof/zoka.webp",
};

export type BlogPost = {
  slug: string;
  /** The on-page H1: the question exactly as she types it. */
  title: string;
  /** The <title> tag, kept under ~60 characters so Google shows it whole. */
  seoTitle: string;
  description: string;
  /** ISO dates. Bump `updated` whenever the content changes. */
  published: string;
  updated: string;
  readMinutes: number;
  author: BlogAuthor;
};

export const POSTS: BlogPost[] = [
  {
    slug: "why-am-i-gaining-weight-in-menopause",
    title: "Why am I gaining weight in menopause even though I eat the same?",
    seoTitle: "Why Am I Gaining Weight in Menopause When I Eat the Same?",
    description:
      "Eating the same but still gaining weight in menopause? Here's why, in plain English: hunger, fat storage, muscle and sleep all shift. And what actually helps.",
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 7,
    author: ZOKA,
  },
];

export function getPost(slug: string): BlogPost {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown blog post: ${slug}`);
  return post;
}

export function postUrl(slug: string): string {
  return `${CANONICAL_ORIGIN}/blog/${slug}`;
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
