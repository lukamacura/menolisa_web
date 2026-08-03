/**
 * Image build step: `assets/` (sources, never served) -> `public/` (what ships).
 *
 * Sources are kept out of `public/` on purpose. Next.js serves everything under
 * `public/` verbatim, so a 3768x3768 master PNG sitting next to its optimized
 * output is 600KB of publicly-reachable dead weight in every deploy. Keeping
 * masters in `assets/` also makes this script idempotent — it always re-encodes
 * from the original, so running it twice never stacks lossy-on-lossy.
 *
 * Widths are ~2x the largest CSS box the image renders into (2x for retina).
 * If you change a layout, change the width here too.
 *
 * Run: npx tsx scripts/optimize-images.ts
 */
import sharp from "sharp";
import { stat, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "assets");
const OUT_DIR = path.join(process.cwd(), "public");

type Job = {
  /** Source file, relative to assets/ */
  src: string;
  /** Output file, relative to public/ */
  out: string;
  /** Max width in px — roughly 2x the largest CSS box the image renders into */
  width: number;
  quality?: number;
  /** Keep PNG instead of converting to WebP (favicon, email) */
  format?: "webp" | "png";
  /**
   * Trim surrounding transparency and pad to a square. For marks rendered into
   * a round container with object-cover, where a padded rectangle would get
   * cropped off-center.
   */
  square?: boolean;
};

const JOBS: Job[] = [
  // Landing hero — LCP element, renders at most 640 CSS px wide
  { src: "hero.png", out: "hero.webp", width: 1280 },
  // Paywall + checkout success illustration — renders at most 280px
  { src: "paywall.png", out: "paywall.webp", width: 560 },
  // Quiz results illustration
  { src: "results.png", out: "results.webp", width: 900 },
  // Personalized offer scroll — full width of the narrow quiz column
  { src: "quiz/offer.png", out: "quiz/offer.webp", width: 1024, quality: 82 },
  // Dashboard banner — full width, max 208px tall
  { src: "lisa-noticed-banner.png", out: "lisa-noticed-banner.webp", width: 900 },
  // Download-step app mockup — renders at 240px
  { src: "mockup.png", out: "mockup.webp", width: 480 },
  // Wax seal on the personalized 8-week plan scroll — renders at 80px
  { src: "personalized_plan.png", out: "personalized_plan.webp", width: 200 },
  // Quiz reward illustrations — render at most 176px (w-44)
  { src: "quiz/rewards/reward1.png", out: "quiz/rewards/reward1.webp", width: 360 },
  { src: "quiz/rewards/reward2.png", out: "quiz/rewards/reward2.webp", width: 360 },
  // Standalone quiz illustrations — loading spinner, name step, login page
  { src: "quiz/illustration_loading.png", out: "quiz/illustration_loading.webp", width: 320 },
  { src: "quiz/illustration_q8_name.png", out: "quiz/illustration_q8_name.webp", width: 400 },
  { src: "quiz/illustration_email.png", out: "quiz/illustration_email.webp", width: 400 },
  // Blurred results teaser on the email step — it's rendered under a 2px blur,
  // so it can take far more compression than anything else here.
  { src: "quiz/results_blur.png", out: "quiz/results_blur.webp", width: 480, quality: 60 },
  // Transactional email logo. Email clients are the one place WebP can't be
  // relied on (Outlook desktop still won't render it), so this stays PNG — it
  // just has no business being the 290KB source. Renders at 96px.
  { src: "paywall.png", out: "email-logo.png", width: 192, format: "png" },
  // Favicon: the 1536x1024 master is absurd for a tab icon
  { src: "favicon.png", out: "favicon.png", width: 256, format: "png" },
  // Landing footer logo — 32px round avatar. Its own source was deleted in
  // 49eeaed, leaving a broken image, so it's regenerated from the brand mark.
  { src: "favicon.png", out: "lisa_profile.webp", width: 64, square: true },
];

/** Whole directories where every image gets the same treatment. */
type DirJob = { dir: string; width: number; quality?: number };

const DIR_JOBS: DirJob[] = [
  // Quiz option tiles: rendered with sizes="50vw" inside a max-w-md (448px)
  // column, so ~224 CSS px at most. These are the funnel's hottest images —
  // every step preloads the next step's full set.
  { dir: "quiz/age", width: 460 },
  { dir: "quiz/status", width: 460 },
  { dir: "quiz/goals", width: 460 },
  { dir: "quiz/how-long", width: 460 },
  { dir: "quiz/hrt", width: 460 },
  { dir: "quiz/fitness", width: 460 },
  { dir: "quiz/readiness", width: 460 },
  // Symptom tiles: same 50vw grid, and again as 48px chips on the results step
  { dir: "symptoms", width: 460 },
  // Before/after strips on the diagnosis step — full width of the quiz column
  { dir: "testimonials", width: 900 },
  // Real app screenshots. sizes="(max-width: 480px) 55vw, 260px", so 260 CSS px
  // is the ceiling — the 1080x2192 masters were ~4x larger than needed.
  { dir: "diagnosys", width: 560 },
];

const kb = (n: number) => `${Math.round(n / 1024)}KB`;

async function sizeOf(abs: string): Promise<number> {
  try {
    return (await stat(abs)).size;
  } catch {
    return 0;
  }
}

async function run(job: Job): Promise<[number, number]> {
  const srcPath = path.join(SRC_DIR, job.src);
  const outPath = path.join(OUT_DIR, job.out);
  const srcSize = await sizeOf(srcPath);

  if (!srcSize) {
    console.warn(`skip  ${job.src} (not found)`);
    return [0, 0];
  }

  await mkdir(path.dirname(outPath), { recursive: true });

  const base = sharp(srcPath);
  const pipeline = job.square
    ? base.trim().resize(job.width, job.width, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
    : base.resize({ width: job.width, withoutEnlargement: true });

  if (job.format === "png") {
    await pipeline.png({ compressionLevel: 9, palette: true }).toFile(outPath);
  } else {
    await pipeline.webp({ quality: job.quality ?? 78, effort: 6 }).toFile(outPath);
  }

  const outSize = await sizeOf(outPath);
  const saved = Math.round((1 - outSize / srcSize) * 100);
  console.log(`ok    ${job.src} ${kb(srcSize)} -> ${job.out} ${kb(outSize)}  (-${saved}%)`);
  return [srcSize, outSize];
}

async function expand(dirJob: DirJob): Promise<Job[]> {
  const files = await readdir(path.join(SRC_DIR, dirJob.dir));
  return files
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort()
    .map((f) => ({
      src: `${dirJob.dir}/${f}`,
      out: `${dirJob.dir}/${f.replace(/\.[^.]+$/, ".webp")}`,
      width: dirJob.width,
      quality: dirJob.quality,
    }));
}

async function main() {
  const dirJobs = (await Promise.all(DIR_JOBS.map(expand))).flat();
  let before = 0;
  let after = 0;

  for (const job of [...JOBS, ...dirJobs]) {
    const [s, o] = await run(job);
    before += s;
    after += o;
  }

  console.log(`\ntotal ${kb(before)} -> ${kb(after)} (-${Math.round((1 - after / before) * 100)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
