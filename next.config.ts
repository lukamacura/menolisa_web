import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Remove console.log in production (keep error, warn)
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },

  // Performance optimizations
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react", "@supabase/supabase-js"],
  },

  // Image optimization (AVIF + WebP, responsive device sizes)
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    qualities: [60, 75],
  },

  // Compression (gzip/brotli)
  compress: true,

  // Production optimizations
  poweredByHeader: false,
  
  // Headers for caching and security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
        ],
      },
      // One rule for every static asset, replacing the per-file list that had
      // drifted out of sync with public/ (it still named files that no longer exist).
      {
        source: "/:path*.:ext(woff2|webp|avif|png|jpg|jpeg|svg|webm|mp4|ico)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // CORS for API routes, development only. The Expo dev server sometimes
      // runs in a browser (`expo start --web`), which needs these; the shipped
      // app is native and sends no Origin, and the web app is same-origin.
      // This rule used to ship to production with a placeholder origin
      // (`https://your-production-domain.com`) plus `Allow-Credentials: true`,
      // which is a header no real origin can satisfy — so omitting it there
      // changes nothing and stops advertising a domain that does not exist.
      // `proxy.ts` still answers preflights and Bearer requests on the routes
      // it matches.
      ...(process.env.NODE_ENV === "development"
        ? [
            {
              source: "/api/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, PATCH, OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With" },
                { key: "Access-Control-Max-Age", value: "86400" },
              ],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
