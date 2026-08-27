/**
 * Validates and uploads the exercise clips in `exercise-clips`.
 *
 * The 2026-08-25 batch went live with three faults that were invisible from the
 * Supabase dashboard — it shows a filename and a size, and every one of these
 * looks fine by both. They cost real playback quality on a paying customer's
 * phone:
 *
 *   1. `moov` written AFTER `mdat` on all 40 (HandBrake's "Web Optimized" box
 *      unchecked). The player cannot start until it has the index, so it reads
 *      the head, finds nothing, range-requests the tail, then finally streams —
 *      three sequential round trips before the first frame. This is the single
 *      biggest cause of a clip that "loads slow", and it is undetectable
 *      without parsing the file.
 *   2. 607x1080 instead of 1080x1920 — upscaled ~1.8x on every phone, at 30-215KB
 *      against an 800KB budget. The resolution was given away for nothing.
 *   3. One clip in HEVC (`hvc1`) and one carrying an audio track, in a library
 *      that is meant to be uniformly silent H.264.
 *
 * So the gate is here rather than in a checklist. `check` parses the MP4 boxes
 * directly — no ffprobe, nothing to install — and `upload` refuses to push a
 * file that fails it. A bad clip is caught on this machine instead of mid-session
 * on hers.
 *
 *   npx tsx scripts/exercise-clips.ts check  <dir>   # validate, no network
 *   npx tsx scripts/exercise-clips.ts upload <dir>   # validate, then upload
 *   npx tsx scripts/exercise-clips.ts audit          # what is live vs the catalog
 *
 * `upload` also sets `cacheControl` to a year. The dashboard uploader stamps
 * `max-age=3600`, which is why every clip currently revalidates against origin
 * on essentially every play.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, readdirSync, statSync } from "fs";
import { basename, join, extname } from "path";
import { createClient } from "@supabase/supabase-js";

import { EXERCISES } from "../lib/plan/catalog";

const BUCKET = "exercise-clips";

/**
 * The spec, in one place. `hard` failures block an upload; the rest are printed
 * and let through, because they are shoot decisions rather than encode faults —
 * a 3-second clip is a short clip, not a broken one.
 */
const SPEC = {
  width: 1080,
  height: 1920,
  codec: "avc1", // H.264. Not hvc1 — see the header note on mixing codecs.
  /**
   * Budget is a bitrate, not a byte count. Clips run 1.2s to 16s, so a flat cap
   * calls a long clip bloated and waves a short overcooked one through — the
   * 800KB figure this replaced did exactly that on the 2026-08-26 batch.
   *
   * 1600 kbps is generous for what these are: a static camera, one person, a
   * plain background, at a size that renders on a 6-inch screen. Above roughly
   * 1200 the extra bits go into grain nobody can see on a phone, and straight
   * onto her cellular bill.
   */
  maxKbps: 1600,
  maxBytes: 2.5 * 1024 * 1024, // no single clip should be a download
  minSeconds: 4,
  maxSeconds: 12,
  cacheControl: "31536000", // one year; the filename is the version
};

// ─── MP4 box reader ──────────────────────────────────────────────────────────
// Just enough of ISO/IEC 14496-12 to answer the four questions the spec asks.
// Sizes are big-endian; a box is [size:4][type:4][payload], size 1 meaning the
// real 64-bit size follows the type, size 0 meaning "to the end of the parent".

type Box = { type: string; start: number; size: number; header: number };

function boxes(buf: Buffer, from: number, to: number): Box[] {
  const out: Box[] = [];
  let off = from;
  while (off + 8 <= to) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      size = to - off;
    }
    if (size < 8 || off + size > to) break;
    out.push({ type, start: off, size, header });
    off += size;
  }
  return out;
}

const find = (list: Box[], type: string) => list.find((b) => b.type === type);
const children = (buf: Buffer, b: Box) => boxes(buf, b.start + b.header, b.start + b.size);

type Probe = {
  bytes: number;
  faststart: boolean;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: number | null;
  seconds: number | null;
  hasAudio: boolean;
};

function probe(buf: Buffer): Probe {
  const top = boxes(buf, 0, buf.length);
  const iMoov = top.findIndex((b) => b.type === "moov");
  const iMdat = top.findIndex((b) => b.type === "mdat");

  const result: Probe = {
    bytes: buf.length,
    // A file with no mdat at top level is fragmented or malformed; treat the
    // index as not-in-front rather than guessing it is fine.
    faststart: iMoov >= 0 && iMdat >= 0 && iMoov < iMdat,
    width: null,
    height: null,
    codec: null,
    fps: null,
    seconds: null,
    hasAudio: false,
  };

  const moov = iMoov >= 0 ? top[iMoov] : undefined;
  if (!moov) return result;
  const moovKids = children(buf, moov);

  const mvhd = find(moovKids, "mvhd");
  if (mvhd) {
    const p = mvhd.start + mvhd.header;
    const version = buf.readUInt8(p);
    const timescale = version === 0 ? buf.readUInt32BE(p + 12) : buf.readUInt32BE(p + 20);
    const duration =
      version === 0 ? buf.readUInt32BE(p + 16) : Number(buf.readBigUInt64BE(p + 24));
    if (timescale > 0) result.seconds = duration / timescale;
  }

  for (const trak of moovKids.filter((b) => b.type === "trak")) {
    const trakKids = children(buf, trak);

    const mdia = find(trakKids, "mdia");
    if (!mdia) continue;
    const mdiaKids = children(buf, mdia);

    // hdlr: [version+flags:4][pre_defined:4][handler_type:4]
    const hdlr = find(mdiaKids, "hdlr");
    const handler = hdlr ? buf.toString("latin1", hdlr.start + 16, hdlr.start + 20) : "";
    if (handler === "soun") {
      result.hasAudio = true;
      continue;
    }
    if (handler !== "vide") continue;

    // tkhd carries width/height as the trailing pair of 16.16 fixed-point ints.
    const tkhd = find(trakKids, "tkhd");
    if (tkhd) {
      const end = tkhd.start + tkhd.size;
      result.width = buf.readUInt32BE(end - 8) >>> 16;
      result.height = buf.readUInt32BE(end - 4) >>> 16;
    }

    const mdhd = find(mdiaKids, "mdhd");
    let mediaTimescale: number | null = null;
    if (mdhd) {
      const p = mdhd.start + mdhd.header;
      const version = buf.readUInt8(p);
      mediaTimescale = version === 0 ? buf.readUInt32BE(p + 12) : buf.readUInt32BE(p + 20);
    }

    const minf = find(mdiaKids, "minf");
    const stbl = minf ? find(children(buf, minf), "stbl") : undefined;
    if (stbl) {
      const stblKids = children(buf, stbl);

      // stsd: [version+flags:4][entry_count:4][entry_size:4][format:4]
      const stsd = find(stblKids, "stsd");
      if (stsd) result.codec = buf.toString("latin1", stsd.start + 20, stsd.start + 24);

      // stts: [version+flags:4][entry_count:4][sample_count:4][sample_delta:4]
      // Constant-framerate clips have a single entry, which is all we encode.
      const stts = find(stblKids, "stts");
      if (stts && mediaTimescale) {
        const delta = buf.readUInt32BE(stts.start + 20);
        if (delta > 0) result.fps = mediaTimescale / delta;
      }
    }
  }

  return result;
}

// ─── The spec check ──────────────────────────────────────────────────────────

/**
 * Filename -> catalog id, for every row that claims a clip.
 *
 * The shoot names its files `L01 - Chair Squat.mp4` and the catalog carries that
 * string verbatim on the row, so the **filename** is what identifies a clip here
 * — not a basename that has to parse as an id. That was the previous rule, and
 * it would have failed all fifty files of the 2026-08-27 batch while telling us
 * nothing about their contents.
 */
const CLIP_TO_ID = new Map(
  EXERCISES.filter((e) => e.clip).map((e) => [e.clip as string, e.id])
);

type Report = { file: string; id: string | undefined; probe: Probe; hard: string[]; soft: string[] };

function inspect(file: string, buf: Buffer): Report {
  const id = CLIP_TO_ID.get(file);
  const p = probe(buf);
  const hard: string[] = [];
  const soft: string[] = [];

  if (!id) {
    hard.push(
      `no catalog row carries clip "${file}" — nothing will ever request it. ` +
        `Add the filename to that exercise's row in lib/plan/catalog.ts.`
    );
  }
  if (!p.faststart) {
    hard.push("moov is after mdat (re-run with -movflags +faststart / HandBrake 'Web Optimized')");
  }
  if (p.hasAudio) {
    hard.push("carries an audio track (clips are silent; strip it with -an)");
  }
  if (p.codec !== SPEC.codec) {
    hard.push(`codec is ${p.codec ?? "unreadable"}, expected ${SPEC.codec} (H.264)`);
  }
  if (p.width !== SPEC.width || p.height !== SPEC.height) {
    hard.push(`${p.width}x${p.height}, expected ${SPEC.width}x${SPEC.height}`);
  }

  const kbps = p.seconds ? (p.bytes * 8) / p.seconds / 1000 : null;
  if (kbps !== null && kbps > SPEC.maxKbps) {
    soft.push(
      `${Math.round(kbps)} kbps, over the ${SPEC.maxKbps} kbps budget ` +
        `(re-encode at a higher CRF — 23 is usually indistinguishable here)`
    );
  }
  if (p.bytes > SPEC.maxBytes) {
    soft.push(`${Math.round(p.bytes / 1024)}KB — over ${Math.round(SPEC.maxBytes / 1024)}KB for one clip`);
  }
  if (p.seconds !== null && (p.seconds < SPEC.minSeconds || p.seconds > SPEC.maxSeconds)) {
    soft.push(`${p.seconds.toFixed(2)}s outside ${SPEC.minSeconds}-${SPEC.maxSeconds}s`);
  }
  if (p.fps !== null && Math.abs(p.fps - 30) > 0.5) {
    soft.push(`${p.fps.toFixed(1)} fps, expected 30`);
  }

  return { file, id, probe: p, hard, soft };
}

function printReport(reports: Report[]) {
  const kb = (n: number) => String(Math.round(n / 1024)).padStart(5);
  const label = (r: Report) => `${r.id ?? "??"} ${r.file.replace(/\.mp4$/i, "")}`.slice(0, 34);
  console.log(
    `\n${"id / file".padEnd(34)} ${"KB".padStart(5)} ${"sec".padStart(5)} ${"kbps".padStart(5)} ` +
      `${"dims".padStart(10)} ${"codec".padEnd(5)} ${"fps".padStart(5)} fast`
  );
  for (const r of reports.sort((a, b) => a.file.localeCompare(b.file))) {
    const p = r.probe;
    const mark = r.hard.length ? "FAIL" : r.soft.length ? "warn" : "ok";
    console.log(
      `${label(r).padEnd(34)} ${kb(p.bytes)} ${(p.seconds?.toFixed(2) ?? "?").padStart(5)} ` +
        `${(p.seconds ? Math.round((p.bytes * 8) / p.seconds / 1000) : "?").toString().padStart(5)} ` +
        `${`${p.width}x${p.height}`.padStart(10)} ${(p.codec ?? "?").padEnd(5)} ` +
        `${(p.fps?.toFixed(1) ?? "?").padStart(5)} ${p.faststart ? "yes " : "NO  "} ${mark}`
    );
    for (const m of r.hard) console.log(`        FAIL  ${m}`);
    for (const m of r.soft) console.log(`        warn  ${m}`);
  }

  const failed = reports.filter((r) => r.hard.length);
  const warned = reports.filter((r) => !r.hard.length && r.soft.length);
  console.log(
    `\n${reports.length} clips: ${reports.length - failed.length - warned.length} clean, ` +
      `${warned.length} with warnings, ${failed.length} failing.`
  );
  return failed;
}

function loadDir(dir: string): Report[] {
  const files = readdirSync(dir).filter((f) => extname(f).toLowerCase() === ".mp4");
  if (!files.length) throw new Error(`no .mp4 files in ${dir}`);
  return files.map((f) => inspect(basename(f), readFileSync(join(dir, f))));
}

// ─── Commands ────────────────────────────────────────────────────────────────

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  return createClient(url, key).storage.from(BUCKET);
}

async function cmdCheck(dir: string) {
  const failed = printReport(loadDir(dir));
  process.exit(failed.length ? 1 : 0);
}

async function cmdUpload(dir: string) {
  const reports = loadDir(dir);
  const failed = printReport(reports);
  if (failed.length) {
    console.error(
      `\nRefusing to upload — ${failed.length} clip(s) fail the spec. ` +
        `Fix the export and re-run; a bad clip here is a bad clip in her session.`
    );
    process.exit(1);
  }

  const bucket = storage();
  console.log(`\nUploading ${reports.length} clips to ${BUCKET} (cacheControl ${SPEC.cacheControl})...`);

  const uploaded: string[] = [];
  for (const r of reports) {
    // Uploaded under the name the catalog row carries, which is the name it was
    // just validated as. Renaming on the way in would put the bucket and the
    // `clip` field out of step at the one moment we can still see both.
    const file = readFileSync(join(dir, r.file));
    const { error } = await bucket.upload(r.file, file, {
      contentType: "video/mp4",
      cacheControl: SPEC.cacheControl,
      upsert: true,
    });
    if (error) {
      console.error(`  ${r.file}  FAILED  ${error.message}`);
      continue;
    }
    uploaded.push(r.file);
    console.log(`  ${r.id}  ${r.file}  ok`);
  }

  console.log(`\n${uploaded.length}/${reports.length} uploaded.`);
  await cmdAudit();
}

async function cmdAudit() {
  const bucket = storage();
  const { data, error } = await bucket.list("", { limit: 1000 });
  if (error) throw error;

  const live = new Map<string, { size: number; cacheControl: string }>();
  for (const o of data ?? []) {
    if (!o.name.endsWith(".mp4")) continue;
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    live.set(o.name, {
      size: Number(meta.size ?? 0),
      cacheControl: String(meta.cacheControl ?? "?"),
    });
  }

  // Read the served URLs back through the only public door, so this audits what
  // the API actually hands the app rather than a second copy of the mapping.
  // `exerciseMedia()` percent-encodes, so decode to compare against bucket keys.
  const { exerciseMedia } = await import("../lib/plan/catalog");
  const served = new Map<string, string>();
  for (const e of EXERCISES) {
    const media = exerciseMedia(e.id);
    if (media) served.set(decodeURIComponent(media.video.split("/").pop()!), e.id);
  }

  const problems: string[] = [];

  console.log(`\n=== bucket vs catalog ===`);
  console.log(`  ${live.size} files live, ${served.size} served by exerciseMedia()`);

  // The failure this exists to catch: the API hands the app a URL, the app
  // requests it mid-session, and there is nothing behind it.
  const ghosts = [...served].filter(([file]) => !live.has(file));
  if (ghosts.length) {
    problems.push(
      `${ghosts.length} row(s) whose clip is not in the bucket — 404 in her player: ` +
        ghosts.map(([file, id]) => `${id} -> "${file}"`).join(", ")
    );
  }

  const unserved = [...live.keys()].filter((file) => !served.has(file));
  if (unserved.length) {
    console.log(
      `  uploaded but no catalog row claims them (add the filename to a row to serve them):\n` +
        unserved.map((f) => `    ${f}`).join("\n")
    );
  }

  const stale = [...live.entries()].filter(([, v]) => v.cacheControl !== `max-age=${SPEC.cacheControl}`);
  if (stale.length) {
    console.log(
      `  ${stale.length} file(s) with a short cacheControl (re-upload through this script to fix): ` +
        stale.map(([f, v]) => `${f}=${v.cacheControl}`).slice(0, 4).join(", ") +
        (stale.length > 4 ? ", ..." : "")
    );
  }

  const unshot = EXERCISES.filter((e) => !e.clip).map((e) => e.id);
  console.log(`  ${unshot.length} catalog id(s) with no clip: ${unshot.join(", ") || "none"}`);

  if (problems.length) {
    console.error("\n" + problems.map((p) => `FAIL  ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\nNo blocking problems.");
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const [cmd, dir] = process.argv.slice(2);

const usage = `
  npx tsx scripts/exercise-clips.ts check  <dir>   validate local .mp4 files, no network
  npx tsx scripts/exercise-clips.ts upload <dir>   validate, then upload with a 1-year cacheControl
  npx tsx scripts/exercise-clips.ts audit          compare the live bucket against the catalog's clip filenames
`;

async function main() {
  if (cmd === "check" || cmd === "upload") {
    if (!dir) {
      console.error(`${cmd} needs a directory.\n${usage}`);
      process.exit(1);
    }
    if (!statSync(dir).isDirectory()) {
      console.error(`${dir} is not a directory.`);
      process.exit(1);
    }
    return cmd === "check" ? cmdCheck(dir) : cmdUpload(dir);
  }
  if (cmd === "audit") return cmdAudit();
  console.error(usage);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
