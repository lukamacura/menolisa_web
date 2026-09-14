import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "@/lib/blog";

/**
 * /register stays crawlable (Meta's ad crawler fetches it); everything behind
 * a session or a password is kept out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/admin", "/auth/", "/checkout/", "/paywall", "/delete-account"],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  };
}
