// app/layout.tsx
import "./globals.css";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import AppDownloadWidget from "@/components/AppDownloadWidget";
import PreloaderGate from "@/components/PreloaderGate";
import localFont from "next/font/local";
import { Dancing_Script, Poppins, Lora } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const satoshi = localFont({
  src: [
    { path: "../public/fonts/Satoshi-Light.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Satoshi-Regular.woff2",  weight: "500", style: "normal" },
    { path: "../public/fonts/Satoshi-Bold.woff2",    weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-script",
  display: "swap",
});

// Tweakcn theme fonts
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
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
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let isAuthenticated = false;
  if (supabaseUrl && supabaseAnonKey) {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = !!user;
  }

  return (
    <html lang="en" className={`${satoshi.variable} ${dancingScript.variable} ${poppins.variable} ${lora.variable}`}>
      <head>
        {/* LCP: preload critical fonts for hero text */}
        <link rel="preload" href="/fonts/Satoshi-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Satoshi-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* LCP: preload navbar logo (critical above-the-fold image) */}
        <link rel="preload" href="/favicon.png" as="image" />
        {/* Preconnect to Supabase for faster API/auth on first request */}
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} />}
        {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
      </head>
      <body className="min-h-screen flex flex-col font-sans text-foreground bg-background">
        <PreloaderGate />
        <ConditionalNavbar isAuthenticated={isAuthenticated} />

        <main className="flex-1 w-full">{children}</main>

        <AppDownloadWidget />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
