import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, POSTS } from "@/lib/blog";

/**
 * Public, indexable pages only. The funnel, paywall, dashboard and admin are
 * left out on purpose: none of them is a page anyone should land on from
 * search.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: CANONICAL_ORIGIN, changeFrequency: "weekly", priority: 1 },
    { url: `${CANONICAL_ORIGIN}/blog`, changeFrequency: "weekly", priority: 0.8 },
    ...POSTS.map((p) => ({
      url: `${CANONICAL_ORIGIN}/blog/${p.slug}`,
      lastModified: p.updated,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    { url: `${CANONICAL_ORIGIN}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${CANONICAL_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
