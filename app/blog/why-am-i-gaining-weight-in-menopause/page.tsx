import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BlogQuizCta from "@/components/blog/BlogQuizCta";
import LandingCtaBar from "@/components/landing/LandingCtaBar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CANONICAL_ORIGIN, formatPostDate, getPost, postUrl } from "@/lib/blog";
import { PLAN_WEEKS } from "@/lib/pricing";

/*
 * Written to rank for "why am I gaining weight in menopause even though I eat
 * the same". The H1 is the question verbatim and the first block answers it in
 * ~70 words, which is the shape Google lifts into a featured snippet.
 *
 * Claims rule, the same one /terms and the funnel are held to: every
 * statement is general physiology or a real, named study, and nothing
 * promises an outcome (no "lose X pounds"). The weight mechanism matches the
 * results card (getWeightChain in lib/quiz-results-helpers.ts), so the page
 * she reads and the results she gets tell one story.
 */

const post = getPost("why-am-i-gaining-weight-in-menopause");
const url = postUrl(post.slug);

export const metadata: Metadata = {
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
    images: [{ url: `${CANONICAL_ORIGIN}${post.author.photo}`, alt: "Zoka, who came up with MenoLisa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: post.seoTitle,
    description: post.description,
  },
};

const SECTIONS = [
  { id: "not-imagining-it", label: "You're not imagining it" },
  { id: "control-center", label: "1. Your brain's control center is adjusting" },
  { id: "belly-fat", label: "2. Fat moves to your middle" },
  { id: "muscle", label: "3. You're slowly losing muscle" },
  { id: "sleep", label: "4. Your sleep is off, and hunger follows" },
  { id: "moving-less", label: "5. You're moving less without noticing" },
  { id: "eating-less", label: "Why eating even less usually backfires" },
  { id: "what-helps", label: "What actually helps" },
  { id: "doctor", label: "When to talk to your doctor" },
  { id: "faq", label: "Questions women ask" },
] as const;

const FAQS = [
  {
    q: "Does menopause slow down your metabolism?",
    a: "Not as much as most people think. A large 2021 study of metabolism across the lifespan found it stays fairly steady from your 20s until about 60, once body size is taken into account. What changes in menopause is your muscle, where fat is stored, your sleep and your hunger. Together they make it feel like your metabolism slowed, and all of them are things you can work on.",
  },
  {
    q: "Why is my stomach getting bigger during menopause?",
    a: "Lower estrogen changes where your body stores new fat, moving it from your hips and thighs to your belly. Stress and poor sleep push in the same direction. Strength work, a daily walk, protein at every meal and better sleep all help.",
  },
  {
    q: "How much weight do women gain during menopause?",
    a: "It varies a lot from woman to woman. On average, women gain a little each year through midlife, often around a pound a year, and more of it shows up at the waist than before.",
  },
  {
    q: "Can you lose weight after menopause?",
    a: "Yes. It usually takes a different approach than it did at 30. Less about eating as little as possible, more about keeping your muscle, moving every day, eating enough protein and sleeping better. Steady changes you can keep up beat any crash diet.",
  },
  {
    q: "Does hormone therapy cause weight gain?",
    a: "Studies have not found that hormone therapy causes weight gain, and some suggest it may help limit fat around the middle. Whether it's right for you is a decision for you and your doctor.",
  },
] as const;

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
      author: {
        "@type": "Person",
        name: post.author.name,
        description: post.author.role,
      },
      publisher: {
        "@type": "Organization",
        name: "MenoLisa",
        url: CANONICAL_ORIGIN,
        logo: { "@type": "ImageObject", url: `${CANONICAL_ORIGIN}/favicon.png` },
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
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

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-24 text-2xl font-bold leading-snug text-[#2E2A2B] sm:text-[28px]">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[17px] leading-[1.75] text-[#3D3739]">{children}</p>;
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-[#E8DDD9] bg-white/70 p-4">
      <p className="font-bold text-[#2E2A2B]">{title}</p>
      <p className="mt-1 text-[16px] leading-relaxed text-[#5B5557]">{children}</p>
    </li>
  );
}

export default function Page() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #FBE9F1 0%, #FDF4F1 20%, #FFFCF8 45%)" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-2xl px-4 pt-24 pb-16 sm:pt-28">
        <nav aria-label="Breadcrumb" className="text-sm text-[#8C8279]">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-1.5">/</span>
          <Link href="/blog" className="hover:underline">Blog</Link>
        </nav>

        <h1 className="mt-4 text-[32px] font-extrabold leading-[1.15] text-[#2E2A2B] sm:text-[42px]">
          {post.title}
        </h1>

        <div className="mt-5 flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-white">
            <Image
              src={post.author.photo}
              alt={post.author.name}
              fill
              sizes="48px"
              className="object-cover object-[50%_28%]"
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

        {/* The answer first, in one block: this is the featured-snippet target. */}
        <section className="mt-8 rounded-2xl border-l-4 border-[#E8487F] bg-white/80 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[#C2437F]">The short answer</p>
          <p className="mt-2 text-[17px] leading-[1.7] text-[#2E2A2B]">
            Because the same food is now landing in a different body. As estrogen drops, your brain
            turns hunger up and your daily burn down a little, new fat gets stored around your middle
            instead of your hips, and you slowly lose muscle, the part of you that burns calories even
            while you sit. Add broken sleep, and the plate that kept you steady at 40 can leave a small
            extra at 50. <strong>It isn&apos;t a willpower problem, and it responds to the right daily habits.</strong>
          </p>
        </section>

        <nav aria-label="In this article" className="mt-8 rounded-2xl border border-[#E8DDD9] bg-[#FFFCF8] p-5">
          <p className="text-sm font-bold text-[#2E2A2B]">In this article</p>
          <ol className="mt-2 space-y-1.5 text-[15px]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:underline">{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <H2 id="not-imagining-it">You&apos;re not imagining it</H2>
        <P>
          If your jeans stopped fitting and nothing about your plate changed, you&apos;re in very good
          company. Weight is the number one thing women pick when our quiz asks which symptom is
          hitting them hardest.
        </P>
        <P>
          Research says the same thing. The SWAN study, which followed thousands of American women
          through midlife for years, found a clear pattern during the menopause years: fat tends to go
          up, muscle tends to go down, and more of the fat collects around the waist. The scale might
          only move a little. Your shape can change a lot.
        </P>
        <P>Here are the five things that change, in plain English.</P>

        <H2 id="control-center">1. Your brain&apos;s control center is adjusting</H2>
        <P>
          Deep in your brain is a small area called the hypothalamus. Think of it as your body&apos;s
          thermostat. It helps decide how hungry you feel, how warm you run and how much energy you
          burn, and it used estrogen as one of its signals.
        </P>
        <P>
          When estrogen drops, that control center has to adjust. It&apos;s the same reason hot flashes
          happen. For many women, the result is feeling a bit hungrier while the body spends a bit
          less. Nothing dramatic on any one day. But a small shift, every day, adds up over a year.
        </P>

        <H2 id="belly-fat">2. Fat moves to your middle</H2>
        <P>
          Before menopause, estrogen tends to send fat to your hips and thighs. With less of it, new
          fat is more likely to be stored around your belly, including deeper fat around your organs.
        </P>
        <P>
          That&apos;s why so many women say, &ldquo;I don&apos;t weigh much more, but my waist is
          different.&rdquo; It&apos;s also the change doctors watch most closely, because belly fat is
          linked to heart health and blood sugar.
        </P>

        <H2 id="muscle">3. You&apos;re slowly losing muscle</H2>
        <P>
          Muscle is your body&apos;s engine. It burns energy even when you&apos;re resting. From your
          30s on, adults slowly lose muscle unless they use it, and the loss speeds up around
          menopause because estrogen helped protect it. Same fuel, smaller engine, more left over.
        </P>
        <P>
          Here&apos;s the part most people get wrong. A large 2021 study of metabolism across the
          lifespan found that it doesn&apos;t suddenly crash at 50. Once body size is taken into
          account, it stays fairly steady until about 60. What changes is how much muscle you carry
          and how much you move, and you can do something about both.
        </P>

        <H2 id="sleep">4. Your sleep is off, and your hunger follows</H2>
        <P>
          Night sweats. Waking at 3 a.m. with a busy mind. When you sleep badly, your body makes more
          of the hormone that makes you hungry (ghrelin) and less of the one that tells you you&apos;re
          full (leptin). You also crave quick energy, like sugar and bread.
        </P>
        <P>
          Stress works the same way. The stress hormone cortisol nudges your body to store fat around
          the middle. So even when your meals look exactly the same, the snacks around them often
          don&apos;t.
        </P>

        <H2 id="moving-less">5. You&apos;re moving less without noticing</H2>
        <P>
          Tired days mean fewer steps, more sitting and fewer trips up the stairs. Achy joints make it
          worse. This everyday movement, not the gym, is a big part of the energy you burn each day,
          and it quietly drops when you&apos;re worn out.
        </P>

        <BlogQuizCta
          heading="Which of these is driving yours?"
          body={`Take the free 2-minute quiz. It asks about your symptoms, your stage and your day, then shows you what's behind your weight and builds a personal ${PLAN_WEEKS}-week plan around it.`}
          label="Find out in 2 minutes"
        />

        <H2 id="eating-less">Why eating even less usually backfires</H2>
        <P>
          The natural reaction is to cut more. Skip breakfast, halve the portions, try the diet that
          worked at 35.
        </P>
        <P>
          The problem is that when you cut calories hard without doing any strength work, you lose
          muscle along with the fat. Less muscle means a smaller engine, so you end up hungrier with a
          body that burns even less. That&apos;s the loop so many women get stuck in.{" "}
          <strong>The fix isn&apos;t eating less. It&apos;s changing what you do with the body you have now.</strong>
        </P>

        <H2 id="what-helps">What actually helps</H2>
        <P>None of this needs a gym, a special diet or hours a day.</P>
        <ul className="mt-5 space-y-3">
          <Tip title="Work your muscles 2 to 3 times a week">
            Strength work is the one thing that rebuilds the muscle you&apos;ve been losing. Squats to a
            chair, wall push-ups, carrying the groceries. Short and regular beats long and rare.
          </Tip>
          <Tip title="Walk every day">
            A brisk daily walk is easy on your joints, helps with belly fat and lifts your mood and your
            sleep. Go at a pace where you could talk but not sing.
          </Tip>
          <Tip title="Put protein at every meal">
            Protein keeps you full for longer and gives your muscles what they need to rebuild. A
            palm-sized portion at breakfast, lunch and dinner is a simple place to start.
          </Tip>
          <Tip title="Add fiber">
            Vegetables, beans, oats and berries fill you up and help keep your blood sugar steady.
          </Tip>
          <Tip title="Protect your sleep">
            A cool bedroom, the same bedtime every night and a short wind-down do more for your
            appetite than most diets.
          </Tip>
          <Tip title="Watch your waist, not only the scale">
            When you add strength work you can lose fat and gain muscle at the same time. How your
            clothes fit often tells you more than the number.
          </Tip>
        </ul>

        <H2 id="doctor">When to talk to your doctor</H2>
        <P>Menopause explains a lot, but not everything. Check in with your doctor if:</P>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-[17px] leading-[1.7] text-[#3D3739]">
          <li>you&apos;re gaining weight quickly and can&apos;t see why</li>
          <li>you also feel cold, very tired, or your skin and hair are dry (your thyroid is worth checking)</li>
          <li>you started a new medication around the time the weight came on</li>
          <li>
            you want to talk about hormone therapy. It&apos;s a real option for many women, and it&apos;s
            worth discussing with someone who knows your health history
          </li>
        </ul>

        {/* The speaker. Zoka's words match her note in the funnel
            (FounderNoteBoard) - no personal history is claimed for her. */}
        <section className="mt-14 overflow-hidden rounded-3xl border border-[#E8DDD9] bg-white/85 shadow-[0_20px_45px_-28px_rgba(61,61,61,0.55)] sm:grid sm:grid-cols-[200px_1fr]">
          <div className="relative aspect-[4/5] w-full sm:aspect-auto sm:h-full">
            <Image
              src={post.author.photo}
              alt="Zoka, who came up with MenoLisa, holding the MenoLisa quiz on her phone"
              fill
              sizes="(max-width: 640px) 100vw, 200px"
              className="object-cover object-[50%_40%]"
            />
          </div>
          <div className="p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-[#C2437F]">A note from Zoka</p>
            <p className="mt-3 text-[17px] leading-[1.7] text-[#2E2A2B]">
              You probably already know the list: move, eat enough protein, wind down, sleep. What
              breaks is the busy Tuesday, when the plan turns into one more thing to figure out.
            </p>
            <p className="mt-3 text-[17px] leading-[1.7] text-[#2E2A2B]">
              That&apos;s why I wanted MenoLisa to do the figuring out for you. You take a short quiz,
              and you get a plan built around your body and the symptom bothering you most. Open the
              app and today is already laid out.
            </p>
            <p className="mt-4 font-script text-[26px] leading-none text-[#3D3D3D]">Zoka</p>
            <p className="mt-1 text-sm text-[#8C8279]">{post.author.role}</p>
          </div>
        </section>

        <BlogQuizCta
          heading={`Get your personal ${PLAN_WEEKS}-week plan`}
          body="Thirteen one-tap questions. You see your results before any price, and we never ask for your email."
          label="Start the free quiz"
        />

        <H2 id="faq">Questions women ask</H2>
        <div className="mt-5 divide-y divide-[#E8DDD9] rounded-2xl border border-[#E8DDD9] bg-[#FFFCF8]">
          {FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-semibold text-[#2E2A2B]">{f.q}</h3>
              <p className="mt-1.5 text-[16px] leading-relaxed text-[#5B5557]">{f.a}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm leading-relaxed text-[#8C8279]">
          This article is for general education and isn&apos;t medical advice. MenoLisa doesn&apos;t
          replace your doctor, so talk to them about any symptom that worries you.
        </p>
      </article>

      <LandingFooter />
      <LandingCtaBar />
    </main>
  );
}
