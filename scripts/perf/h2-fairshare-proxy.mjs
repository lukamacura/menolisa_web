/**
 * A fair-share HTTP/2 reverse proxy in front of `next start`.
 *
 * Why this exists: Vercel's edge multiplexes every HTTP/2 stream with equal
 * weight and ignores the priority the browser asks for. Measured 2026-09-19
 * on the live `/register` under real slow-4G throttling, the 24KB
 * render-blocking stylesheet (VeryHigh) finished at 2.8s, *after* ten images,
 * four fonts and most of the async JS requested in the same instant — and
 * first paint waited on it. `next start` on its own is HTTP/1.1 with six
 * connections and cannot show that; this proxy, which serves every open stream
 * a fair slice, reproduces the live figure to within 0.1s.
 *
 * So: any load-time decision on the funnel is measured **through this proxy
 * with DevTools throttling** (`--throttling-method=devtools`), never against
 * bare `next start` and never with Lighthouse's default simulation alone. The
 * simulation models an edge that honours priority, and it prices the change
 * that fixed the real problem (inlining the CSS) as slightly *worse*.
 *
 * Usage (or just `npm run perf`, which drives it):
 *
 *   node scripts/perf/h2-fairshare-proxy.mjs <listen-port> <next-start-port>
 *   npx lighthouse https://localhost:<listen-port>/register \
 *       --throttling-method=devtools --chrome-flags="--ignore-certificate-errors"
 *
 * A self-signed certificate is generated next to this file on first run
 * (`*.pem`, gitignored). The proxy forwards only what Lighthouse needs and is
 * not a general-purpose server.
 */
import http2 from "node:http2";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const listen = Number(process.argv[2] || 3443);
const target = Number(process.argv[3] || 3000);

const keyPath = path.join(__dirname, "key.pem");
const certPath = path.join(__dirname, "cert.pem");
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 30 -subj "/CN=localhost"`,
    { stdio: "ignore" }
  );
}

const HOP_BY_HOP = new Set(["connection", "transfer-encoding", "keep-alive", "upgrade"]);

const server = http2.createSecureServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
  allowHTTP1: false,
});

server.on("stream", (stream, headers) => {
  const req = http.request(
    {
      host: "localhost",
      port: target,
      path: headers[":path"],
      method: headers[":method"],
      headers: {
        host: `localhost:${target}`,
        accept: headers["accept"] || "*/*",
        "accept-encoding": headers["accept-encoding"] || "",
        "user-agent": headers["user-agent"] || "",
        cookie: headers["cookie"] || "",
      },
    },
    (res) => {
      if (stream.closed || stream.destroyed) {
        res.destroy();
        return;
      }
      const out = { ":status": res.statusCode };
      for (const [k, v] of Object.entries(res.headers)) {
        if (!HOP_BY_HOP.has(k)) out[k] = v;
      }
      try {
        stream.respond(out);
      } catch {
        res.destroy();
        return;
      }
      res.on("error", () => stream.destroy());
      stream.on("close", () => res.destroy());
      res.pipe(stream);
    }
  );
  req.on("error", () => {
    try {
      stream.respond({ ":status": 502 });
      stream.end();
    } catch {
      /* stream already gone */
    }
  });
  // Lighthouse tears connections down mid-flight between runs; an unhandled
  // 'error' on a stream would take the whole proxy with it, and the next run
  // would then read as an interstitial rather than a measurement.
  stream.on("error", () => req.destroy());
  stream.pipe(req);
});

server.on("sessionError", () => {});
server.on("error", (err) => console.error("proxy error:", err.message));
// Last resort: a measurement tool that dies between two runs is worse than one
// that logs and carries on.
process.on("uncaughtException", (err) => console.error("proxy error:", err.message));

server.listen(listen, () => {
  console.log(`fair-share h2 proxy: https://localhost:${listen} -> http://localhost:${target}`);
});
