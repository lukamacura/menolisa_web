/**
 * One-off image optimizer.
 *
 * Several source images in `public/` were many times larger than the box they
 * ever render into — hero.png was 3768x3768 for a 640px slot, paywall.png was
 * 1728x2076 for a 280x160 slot. next/image resizes these on Vercel, but the
 * first request after a deploy still pays for transforming the full-size PNG,
 * and images referenced outside next/image (the favicon) are served raw.
 *
 * Run: npx tsx scripts/optimize-images.ts
 */
import sharp from "sharp";
import { stat } from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

type Job = {
  /** Source file, relative to public/ */
  src: string;
  /** Output file, relative to public/ */
  out: string;
  /** Max width in px — roughly 2x the largest CSS box the image renders into */
  width: number;
  quality?: number;
  /** Keep PNG instead of converting to WebP (favicons) */
  format?: "webp" | "png";
};

const JOBS: Job[] = [
  // Landing hero — LCP element, renders at most 640 CSS px wide
  { src: "hero.png", out: "hero.webp", width: 1280 },
  // Paywall + checkout success illustration — renders at most 280x160
  { src: "paywall.png", out: "paywall.webp", width: 560 },
  // Quiz results illustration — renders at 500x300
  { src: "results.png", out: "results.webp", width: 1000 },
  // Personalized offer scroll — full width of the narrow quiz column
  { src: "quiz/offer.png", out: "quiz/offer.webp", width: 1024, quality: 82 },
  // Dashboard banner — full width, max 208px tall
  { src: "lisa-noticed-banner.png", out: "lisa-noticed-banner.webp", width: 1200 },
  // Already small in dimensions, just badly compressed
  { src: "mockup.png", out: "mockup.webp", width: 577 },
  { src: "phone.png", out: "phone.webp", width: 600 },
  // Favicon: 1536x1024 is absurd for a tab icon
  { src: "favicon.png", out: "favicon.png", width: 256, format: "png" },
];

async function sizeOf(rel: string): Promise<number> {
  try {
    return (await stat(path.join(PUBLIC_DIR, rel))).size;
  } catch {
    return 0;
  }
}

const kb = (n: number) => `${Math.round(n / 1024)}KB`;

async function main() {
  let before = 0;
  let after = 0;

  for (const job of JOBS) {
    const srcPath = path.join(PUBLIC_DIR, job.src);
    const outPath = path.join(PUBLIC_DIR, job.out);
    const srcSize = await sizeOf(job.src);

    if (!srcSize) {
      console.warn(`skip  ${job.src} (not found)`);
      continue;
    }

    // Read into a buffer first so src === out (favicon) doesn't race itself.
    const pipeline = sharp(await sharp(srcPath).toBuffer()).resize({
      width: job.width,
      withoutEnlargement: true,
    });

    if (job.format === "png") {
      await pipeline.png({ compressionLevel: 9, palette: true }).toFile(outPath);
    } else {
      await pipeline.webp({ quality: job.quality ?? 78, effort: 6 }).toFile(outPath);
    }

    const outSize = await sizeOf(job.out);
    before += srcSize;
    after += outSize;
    const saved = Math.round((1 - outSize / srcSize) * 100);
    console.log(`ok    ${job.src} ${kb(srcSize)} -> ${job.out} ${kb(outSize)}  (-${saved}%)`);
  }

  console.log(`\ntotal ${kb(before)} -> ${kb(after)} (-${Math.round((1 - after / before) * 100)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
