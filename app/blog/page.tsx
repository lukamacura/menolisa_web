import type { Metadata } from "next";
import Link from "next/link";
import LandingCtaBar from "@/components/landing/LandingCtaBar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CANONICAL_ORIGIN, POSTS, formatPostDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "The MenoLisa Blog | Menopause, in plain English",
  description:
    "Straight answers to the menopause questions women actually search for: weight, sleep, hot flashes and what helps.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/blog` },
};

export default function BlogIndex() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #FBE9F1 0%, #FDF4F1 28%, #FFFCF8 60%)" }}
    >
      <section className="mx-auto max-w-2xl px-4 pt-24 pb-16 sm:pt-28">
        <h1 className="text-4xl font-extrabold leading-[1.1] text-[#2E2A2B] sm:text-5xl">
          Menopause, in plain English
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[#5B5557]">
          Straight answers to the questions women actually ask.
        </p>

        <ul className="mt-10 space-y-4">
          {POSTS.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="block rounded-2xl border border-[#E8DDD9] bg-white/80 p-5 transition-shadow hover:shadow-[0_14px_30px_-18px_rgba(194,67,127,0.5)]"
              >
                <h2 className="text-xl font-bold leading-snug text-[#2E2A2B]">{p.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-[#5B5557]">{p.description}</p>
                <p className="mt-3 text-sm text-[#8C8279]">
                  By {p.author.name} · {formatPostDate(p.updated)} · {p.readMinutes} min read
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <LandingFooter />
      <LandingCtaBar />
    </main>
  );
}
