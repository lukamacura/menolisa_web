import Image from "next/image";
import Link from "next/link";
import MechanismClose from "@/components/blog/MechanismClose";
import LandingCtaBar from "@/components/landing/LandingCtaBar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CANONICAL_ORIGIN, type BlogPost, formatPostDate, postUrl } from "@/lib/blog";

/**
 * The shell every post renders in: breadcrumb, the question as the H1, Zoe's
 * byline, a short answer (the featured-snippet target), the body, and the
 * shared ending. The fixed <LandingCtaBar /> is the page's one button; the
 * only link inside the article is MechanismClose's line to /register.
 *
 * Health claims in a post are held to the rule the legal pages are: general
 * physiology or a real, named study, and no outcome promise.
 */
export default function BlogArticle({
  post,
  answer,
  children,
}: {
  post: BlogPost;
  answer: React.ReactNode;
  children: React.ReactNode;
}) {
  const url = postUrl(post.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.published,
        dateModified: post.updated,
        mainEntityOfPage: url,
        image: `${CANONICAL_ORIGIN}${post.author.photo}`,
        author: { "@type": "Person", name: post.author.name, description: post.author.role },
        publisher: {
          "@type": "Organization",
          name: "MenoLisa",
          url: CANONICAL_ORIGIN,
          logo: { "@type": "ImageObject", url: `${CANONICAL_ORIGIN}/favicon.png` },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: CANONICAL_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${CANONICAL_ORIGIN}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };

  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #FBE9F1 0%, #FDF4F1 20%, #FFFCF8 45%)" }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="mx-auto max-w-2xl px-4 pt-24 pb-10 sm:pt-28">
        <nav aria-label="Breadcrumb" className="text-sm text-[#8C8279]">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-1.5">/</span>
          <Link href="/blog" className="hover:underline">Blog</Link>
        </nav>

        <h1 className="mt-4 text-[32px] font-extrabold leading-[1.15] text-[#2E2A2B] sm:text-[42px]">
          {post.title}
        </h1>

        <div className="mt-5 flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-white">
            <Image
              src={post.author.photo}
              alt={post.author.name}
              fill
              sizes="56px"
              className="object-cover object-[50%_60%]"
              priority
            />
          </div>
          <div className="text-sm leading-snug">
            <p className="font-semibold text-[#2E2A2B]">
              By {post.author.name} · <span className="font-normal text-[#5B5557]">{post.author.role}</span>
            </p>
            <p className="text-[#8C8279]">
              Updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time> · {post.readMinutes} min read
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border-l-4 border-[#E8487F] bg-white/80 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[#C2437F]">The short answer</p>
          <p className="mt-2 text-[17px] leading-[1.7] text-[#2E2A2B]">{answer}</p>
        </section>

        {children}

        <MechanismClose />
      </article>

      <p className="mx-auto max-w-2xl px-4 pb-10 text-sm leading-relaxed text-[#8C8279]">
        This article is for general education and isn&apos;t medical advice. MenoLisa doesn&apos;t
        replace your doctor, so talk to them about any symptom that worries you.
      </p>

      <LandingFooter />
      <LandingCtaBar />
    </main>
  );
}
