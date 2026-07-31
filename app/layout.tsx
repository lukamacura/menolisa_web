// app/layout.tsx
import "./globals.css";

import type { Metadata } from "next";
import { cookies } from "next/headers";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Navbar-only hint: is there an auth cookie at all? This is a local cookie read,
  // NOT a call to Supabase. The previous `supabase.auth.getUser()` here put a network
  // round-trip to the Supabase auth API in front of the first byte of HTML on EVERY
  // request — including anonymous landing and quiz-funnel traffic that has no session
  // to check. ConditionalNavbar already re-verifies the session on the client, so the
  // server value only needs to be right often enough to avoid a logged-in/out flash.
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name) && !!c.value);

  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${dancingScript.variable} ${poppins.variable} ${lora.variable}`}>
      <head>
        {/* Preconnect to Supabase for faster API/auth on first request */}
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} />}
        {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
      </head>
      <body className="min-h-screen flex flex-col font-sans text-foreground bg-background">
        <MetaPixel />
        <ConditionalNavbar isAuthenticated={isAuthenticated} />

        <main className="flex-1 w-full">{children}</main>

        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
