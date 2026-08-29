/**
 * Validates and uploads the guided meditation in `relaxation-audio`.
 *
 * The sibling of `exercise-clips.ts`, and it exists for the same reason: the
 * Supabase dashboard shows a filename and a size, and every fault that actually
 * costs a paying customer something is invisible by both. The first upload of
 * `meditation.MP3` went through the dashboard and landed with
 * `cacheControl: max-age=3600` on a 15MB file — the exact mistake the clips
 * library made, on a file 200 times the size.
 *
 *   npx tsx scripts/relaxation-audio.ts check   <file>   parse it, no network
 *   npx tsx scripts/relaxation-audio.ts upload  <file>   validate, then upload
 *   npx tsx scripts/relaxation-audio.ts audit            live bucket vs the catalog
 *   npx tsx scripts/relaxation-audio.ts recache          re-upload what is live with a 1-year header
 *
 * `recache` is the one command with no equivalent on the clips side. It pulls
 * the live object and pushes the same bytes back with the right header, so a
 * file already uploaded through the dashboard can be fixed without hunting for
 * whoever still has the master.
 *
 * **The duration check is the one that matters.** `Meditation.seconds` is what
 * the app prints on the choice card before it has fetched a byte, so a file
 * whose real length disagrees with the catalog is a screen that promises eleven
 * minutes and delivers six. Nothing else here can fail a build; this can.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, statSync } from "fs";
import { basename } from "path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "relaxation-audio";

/**
 * `hard` failures block an upload. Everything else is printed and let through:
 * a meditation is a recording someone made, and this script is not entitled to
 * refuse it over an encode preference.
 */
const SPEC = {
  /** One year, in seconds. The dashboard stamps 3600. */
  cacheControl: "31536000",
  /** Real length must be within this of the catalog's `seconds`. Hard. */
  durationToleranceSeconds: 2,
  /**
   * Soft. Voice over a quiet bed does not need 192 kbps joint stereo — 96 kbps
   * mono is transparent for this material and a third of the bytes. She pays
   * for the difference once, on her own data, on the first play.
   */
  maxKbps: 128,
  /** Soft. A guide to the same end as the bitrate, in the unit she would notice. */
  maxBytes: 12 * 1024 * 1024,
};

// ─── MP3 parsing ─────────────────────────────────────────────────────────────
//
// Walked frame by frame rather than trusted to a header. A CBR MP3 can be
// divided by its bitrate for a duration, but a VBR one cannot, and the file
// does not say which it is anywhere you can read in one place — the Xing header
// that would tell you is itself optional. Counting frames is right for both and
// needs nothing installed.

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

type Frame = {
  kbps: number;
  sampleRate: number;
  mono: boolean;
  /** Frame length in bytes, padding included. */
  length: number;
  /** Samples per frame — 1152 on MPEG 1, 576 on MPEG 2/2.5. */
  samples: number;
};

function readFrame(buf: Buffer, i: number): Frame | null {
  if (i + 4 > buf.length) return null;
  // Sync word: eleven set bits.
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;

  const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG 1, 2 = MPEG 2, 0 = MPEG 2.5
  const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
  if (layer !== 1 || version === 1) return null;

  const bitrateIndex = (buf[i + 2] >> 4) & 0xf;
  const rateIndex = (buf[i + 2] >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 0xf || rateIndex === 3) return null;

  const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex];
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const padding = (buf[i + 2] >> 1) & 1;
  const samples = version === 3 ? 1152 : 576;

  return {
    kbps,
    sampleRate,
    mono: ((buf[i + 3] >> 6) & 3) === 3,
    length: Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding,
    samples,
  };
}

/** Bytes of ID3v2 tag at the head, if any. The size is stored as four 7-bit bytes. */
function id3Size(buf: Buffer): number {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return 0;
  return (
    10 +
    (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
  );
}

type Probe = {
  file: string;
  bytes: number;
  seconds: number;
  avgKbps: number;
  cbr: boolean;
  mono: boolean;
  sampleRate: number;
};

function probe(path: string): Probe {
  const buf = readFileSync(path);

  // Find the first frame that is followed by a second one. A single valid-looking
  // header can occur inside tag or album-art bytes; two in a row cannot.
  let start = -1;
  for (let i = id3Size(buf); i < Math.min(buf.length - 4, id3Size(buf) + 200_000); i++) {
    const frame = readFrame(buf, i);
    if (frame && readFrame(buf, i + frame.length)) {
      start = i;
      break;
    }
  }
  if (start < 0) throw new Error(`${basename(path)}: no MPEG Layer III frames found — is it an MP3?`);

  const first = readFrame(buf, start)!;
  let frames = 0;
  let audioBytes = 0;
  let cbr = true;
  for (let i = start; i < buf.length - 4; ) {
    const frame = readFrame(buf, i);
    if (!frame) break;
    if (frame.kbps !== first.kbps) cbr = false;
    frames++;
    audioBytes += frame.length;
    i += frame.length;
  }

  const seconds = (frames * first.samples) / first.sampleRate;
  return {
    file: basename(path),
    bytes: buf.length,
    seconds,
    avgKbps: Math.round((audioBytes * 8) / seconds / 1000),
    cbr,
    mono: first.mono,
    sampleRate: first.sampleRate,
  };
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Prints the probe against the catalog. Returns the blocking failures. */
async function report(p: Probe): Promise<string[]> {
  const { meditationMedia } = await import("../lib/plan/catalog");
  const meditation = meditationMedia();
  const hard: string[] = [];

  console.log(`\n${p.file}`);
  console.log(`  ${mmss(p.seconds)}  ${p.avgKbps} kbps ${p.cbr ? "CBR" : "VBR"}  ` +
    `${p.mono ? "mono" : "stereo"}  ${p.sampleRate} Hz  ${(p.bytes / 1024 / 1024).toFixed(1)} MB`);

  if (!meditation) {
    hard.push("meditationMedia() returned nothing — NEXT_PUBLIC_SUPABASE_URL is unset.");
    return hard;
  }

  const expectedFile = decodeURIComponent(meditation.audio.split("/").pop()!);
  if (p.file !== expectedFile) {
    console.log(`  note: the catalog serves "${expectedFile}", not this name — uploading this ` +
      `adds a second file rather than replacing one.`);
  }

  const drift = Math.abs(p.seconds - meditation.seconds);
  if (drift > SPEC.durationToleranceSeconds) {
    hard.push(
      `duration is ${mmss(p.seconds)} but the catalog says ${mmss(meditation.seconds)} — ` +
        `set Meditation.seconds to ${Math.round(p.seconds)} in lib/plan/catalog.ts.`
    );
  }

  if (p.avgKbps > SPEC.maxKbps) {
    console.log(`  over budget: ${p.avgKbps} kbps against ${SPEC.maxKbps}. Voice over a quiet bed ` +
      `is transparent at 96 kbps mono:\n` +
      `    ffmpeg -i in.mp3 -ac 1 -b:a 96k -codec:a libmp3lame out.mp3`);
  }
  if (p.bytes > SPEC.maxBytes) {
    console.log(`  over budget: ${(p.bytes / 1024 / 1024).toFixed(1)} MB against ` +
      `${SPEC.maxBytes / 1024 / 1024} MB. She downloads this once, but she downloads all of it.`);
  }

  return hard;
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  return createClient(url, key).storage.from(BUCKET);
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdCheck(path: string) {
  const hard = await report(probe(path));
  if (hard.length) {
    console.error("\n" + hard.map((h) => `FAIL  ${h}`).join("\n"));
    process.exit(1);
  }
  console.log("\nOK.");
}

async function cmdUpload(path: string) {
  const p = probe(path);
  const hard = await report(p);
  if (hard.length) {
    console.error("\n" + hard.map((h) => `FAIL  ${h}`).join("\n"));
    console.error("\nRefusing to upload.");
    process.exit(1);
  }

  // Uploaded under its own name, which `report` has just checked against the
  // name the catalog serves. Renaming on the way in would put the bucket and
  // the `file` field out of step at the one moment we can still see both.
  const { error } = await storage().upload(p.file, readFileSync(path), {
    contentType: "audio/mpeg",
    cacheControl: SPEC.cacheControl,
    upsert: true,
  });
  if (error) throw error;

  console.log(`\nUploaded ${p.file} (cacheControl ${SPEC.cacheControl}).`);
  await cmdAudit();
}

async function cmdRecache() {
  const bucket = storage();
  const { data, error } = await bucket.list("", { limit: 1000 });
  if (error) throw error;

  const stale = (data ?? []).filter(
    (o) => String((o.metadata as Record<string, unknown>)?.cacheControl ?? "") !== `max-age=${SPEC.cacheControl}`
  );
  if (!stale.length) {
    console.log("Every file already carries the one-year header. Nothing to do.");
    return;
  }

  for (const object of stale) {
    const { data: blob, error: downloadError } = await bucket.download(object.name);
    if (downloadError) {
      console.error(`  ${object.name}  FAILED to download  ${downloadError.message}`);
      continue;
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    const { error: uploadError } = await bucket.upload(object.name, bytes, {
      contentType: String((object.metadata as Record<string, unknown>)?.mimetype ?? "audio/mpeg"),
      cacheControl: SPEC.cacheControl,
      upsert: true,
    });
    if (uploadError) {
      console.error(`  ${object.name}  FAILED to re-upload  ${uploadError.message}`);
      continue;
    }
    console.log(`  ${object.name}  re-uploaded with cacheControl ${SPEC.cacheControl}`);
  }

  await cmdAudit();
}

async function cmdAudit() {
  const bucket = storage();
  const { data, error } = await bucket.list("", { limit: 1000 });
  if (error) throw error;

  const live = new Map(
    (data ?? []).map((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      return [o.name, { size: Number(meta.size ?? 0), cacheControl: String(meta.cacheControl ?? "?") }];
    })
  );

  // Read the served URL back through the only public door, so this audits what
  // the API actually hands the app rather than a second copy of the mapping.
  const { meditationMedia } = await import("../lib/plan/catalog");
  const meditation = meditationMedia();
  const problems: string[] = [];

  console.log(`\n=== bucket vs catalog ===`);
  console.log(`  ${live.size} file(s) live`);

  if (!meditation) {
    problems.push("meditationMedia() returns nothing — the app is being offered no meditation at all.");
  } else {
    const served = decodeURIComponent(meditation.audio.split("/").pop()!);
    const entry = live.get(served);
    if (!entry) {
      // The failure this exists to catch: the API hands the app a URL, the app
      // requests it at bedtime, and there is nothing behind it.
      problems.push(`the catalog serves "${served}" and the bucket has no such file — 404 in her player.`);
    } else {
      console.log(`  serving "${served}"  ${(entry.size / 1024 / 1024).toFixed(1)} MB  ` +
        `cacheControl ${entry.cacheControl}  (${mmss(meditation.seconds)} per the catalog)`);
      if (entry.cacheControl !== `max-age=${SPEC.cacheControl}`) {
        console.log(`  short cacheControl — run \`npm run meditation recache\` to fix it in place.`);
      }
    }

    const unserved = [...live.keys()].filter((name) => name !== served);
    if (unserved.length) {
      console.log(`  uploaded but nothing serves them:\n${unserved.map((f) => `    ${f}`).join("\n")}`);
    }
  }

  if (problems.length) {
    console.error("\n" + problems.map((p) => `FAIL  ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\nNo blocking problems.");
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const usage = `
  npx tsx scripts/relaxation-audio.ts check   <file>   parse the mp3 against the catalog, no network
  npx tsx scripts/relaxation-audio.ts upload  <file>   validate, then upload with a 1-year cacheControl
  npx tsx scripts/relaxation-audio.ts audit            compare the live bucket against the catalog
  npx tsx scripts/relaxation-audio.ts recache          re-upload live files that carry a short header
`;

async function main() {
  const [cmd, path] = process.argv.slice(2);

  if (cmd === "check" || cmd === "upload") {
    if (!path) {
      console.error(`${cmd} needs a file.\n${usage}`);
      process.exit(1);
    }
    if (!statSync(path).isFile()) {
      console.error(`${path} is not a file.`);
      process.exit(1);
    }
    return cmd === "check" ? cmdCheck(path) : cmdUpload(path);
  }
  if (cmd === "audit") return cmdAudit();
  if (cmd === "recache") return cmdRecache();

  console.error(usage);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
