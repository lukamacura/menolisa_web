import type { Metadata } from "next";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * The blog's post registry: the index page, the sitemap and each post's
 * metadata all read from here, so a post is added in one place.
 *
 * Every post answers one search question, in Zoe's voice (first person, plain
 * words, 800-1,200 words), and ends the same way: <MechanismClose /> - the
 * weight chain the funnel's results card explains - then one line to /register.
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
 * Zoe came up with MenoLisa. She is not a clinician, and nothing on the blog
 * may say or imply she is (CLAUDE.md, "Invent an expert ... or credential").
 * Her first person claims no personal history either - no "when I went
 * through it", no weight she lost - unless she has said so and agreed to it.
 */
export const ZOE: BlogAuthor = {
  name: "Zoe",
  role: "Came up with MenoLisa",
  photo: "/proof/zoka.webp",
};

export type BlogPost = {
  slug: string;
  /** The on-page H1: the question as she types it into search. */
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
      "Eating the same as before but still gaining weight in menopause? Here's why, in plain English, and what actually helps.",
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 5,
    author: ZOE,
  },
  {
    slug: "why-menopause-weight-goes-to-your-belly",
    title: "Why does menopause weight go to your belly and not your hips anymore?",
    seoTitle: "Why Menopause Weight Goes to Your Belly, Not Your Hips",
    description:
      "Your hips look the same but your waist doesn't? Here's why menopause moves fat to your belly, why crunches won't fix it, and what does.",
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 5,
    author: ZOE,
  },
  {
    slug: "does-walking-help-menopause-belly-fat",
    title: "Does walking 20 minutes a day actually help with menopause belly fat?",
    seoTitle: "Does Walking 20 Minutes a Day Help Menopause Belly Fat?",
    description:
      "The honest answer: yes, but not on its own. How a daily walk works on belly fat in menopause, how fast to go, and what to pair it with.",
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 5,
    author: ZOE,
  },
  {
    slug: "how-much-protein-women-over-50",
    title: "How much protein does a woman over 50 need to stop losing muscle?",
    seoTitle: "How Much Protein Does a Woman Over 50 Need? (Plain Answer)",
    description:
      "The plain-English number: 25 to 30 grams at every meal. Why you need more after 50, why breakfast matters most, and what 25 grams looks like.",
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 5,
    author: ZOE,
  },
  {
    slug: "8-week-plan-menopause-weight-gain",
    title: `The ${PLAN_WEEKS}-week plan for menopause weight gain: what a realistic week looks like`,
    seoTitle: `${PLAN_WEEKS}-Week Menopause Weight Plan: What a Real Week Looks Like`,
    description: `What a realistic week of an ${PLAN_WEEKS}-week menopause weight plan looks like: short strength work, a daily walk, protein at every meal, and how it builds.`,
    published: "2026-09-14",
    updated: "2026-09-14",
    readMinutes: 6,
    author: ZOE,
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

export function postMetadata(post: BlogPost): Metadata {
  const url = postUrl(post.slug);
  return {
    title: post.seoTitle,
    description: post.description,
    alternates: { canonical: url },
    authors: [{ name: post.author.name }],
    openGraph: {
      type: "article",
      url,
      title: post.seoTitle,
      description: post.description,
      siteName: "MenoLisa",
      publishedTime: post.published,
      modifiedTime: post.updated,
      authors: [post.author.name],
      images: [{ url: `${CANONICAL_ORIGIN}${post.author.photo}`, alt: `${post.author.name}, who came up with MenoLisa` }],
    },
    twitter: { card: "summary_large_image", title: post.seoTitle, description: post.description },
  };
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
