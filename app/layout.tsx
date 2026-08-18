// app/layout.tsx
import "./globals.css";

import type { Metadata } from "next";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import MetaPixel from "@/components/MetaPixel";
import { Dancing_Script, Poppins, Lora } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-script",
  display: "swap",
  preload: false,
});

// Tweakcn theme fonts.
// Weights are limited to what the app actually renders: 400/500/600/700.
// `font-extrabold` (800) and `font-black` (900) appear in markup but resolve to
// 700 anyway because `font-synthesis-weight: none` is set in globals.css.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

// Only rendered on /register — don't spend the first-paint budget on it elsewhere.
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "MenoLisa | AI support for women in menopause",
  description: "AI companion for women's health and menopause support",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

// Deliberately NOT async, and deliberately reads no cookies.
//
// This used to `await cookies()` to give <ConditionalNavbar /> a first-paint
// hint about whether anyone was logged in. Reading a dynamic API in the ROOT
// layout opts every route in the app into dynamic rendering, so `/register`,
// `/paywall`, `/privacy` and `/terms` — none of which render anything
// user-specific on the server — were server-rendered on demand: a serverless
// invocation, and possibly a cold start, in front of the first byte of HTML on
// every Meta ad click.
//
// With the read gone those four prerender to static HTML and are served from
// the CDN edge. ConditionalNavbar establishes auth on the client instead (it
// already re-verified there anyway, and it renders nothing at all on the two
// funnel routes). If you need request data in this file again, put it behind a
// <Suspense> boundary in a leaf component rather than awaiting it here.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${dancingScript.variable} ${poppins.variable} ${lora.variable}`}>
      <head>
        {/* Preconnect to Supabase for faster API/auth on first request */}
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} />}
        {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
        {/*
          The pixel is on every page and fires before anything else we care
          about, so pay its DNS + TLS handshake in parallel with the document
          instead of after fbevents.js is requested. Paid traffic lands cold,
          with nothing for this origin in the connection pool.
        */}
        <link rel="preconnect" href="https://connect.facebook.net" crossOrigin="" />
      </head>
      <body className="min-h-screen flex flex-col font-sans text-foreground bg-background">
        <MetaPixel />
        <ConditionalNavbar />

        <main className="flex-1 w-full">{children}</main>

        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
