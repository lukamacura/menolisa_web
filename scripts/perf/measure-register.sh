#!/bin/zsh
# Measure /register the way a phone on a Meta ad click experiences it.
#
#   npm run perf              # both modes, two runs each
#   npm run perf -- devtools  # real throttling only (what a visitor sees)
#   npm run perf -- simulate  # Lighthouse's model (what PageSpeed Insights reports)
#
# Serves the production build (`npm run build` first) behind the fair-share
# HTTP/2 proxy in this folder - see h2-fairshare-proxy.mjs for why bare
# `next start` is not a valid stand-in for Vercel - warms the image optimizer
# so a cold `/_next/image` transform is not read as render delay, then runs
# Lighthouse mobile (Moto G Power, slow 4G, 4x CPU) and prints the metrics
# and the LCP phase breakdown. JSON reports land in .lighthouse/ (gitignored).
set -u
cd "$(dirname "$0")/../.."
MODES=${1:-"devtools simulate"}
NEXT_PORT=3111
PROXY_PORT=3443
OUT=.lighthouse
mkdir -p "$OUT"

[ -d .next ] || { echo "no .next - run \`npm run build\` first"; exit 1; }
pkill -f "next start -p $NEXT_PORT" 2>/dev/null; pkill -f h2-fairshare-proxy.mjs 2>/dev/null; sleep 1
(npx next start -p "$NEXT_PORT" > "$OUT/next-start.log" 2>&1 &)
(node scripts/perf/h2-fairshare-proxy.mjs "$PROXY_PORT" "$NEXT_PORT" > "$OUT/proxy.log" 2>&1 &)
sleep 4

# Warm every candidate a 412x823 @1.75 phone (and Lighthouse's Chrome) resolves.
curl -sk -o "$OUT/register.html" "https://localhost:$PROXY_PORT/register"
for u in $(grep -o '/_next/image?url=[^ "&]*&amp;w=\(128\|256\|384\)&amp;q=[0-9]*' "$OUT/register.html" | sed 's/&amp;/\&/g' | sort -u); do
  curl -s -o /dev/null -H 'Accept: image/avif,image/webp,*/*' "http://localhost:$NEXT_PORT$u"
done

for mode in ${=MODES}; do
  for n in 1 2; do
    f="$OUT/register-$mode-$n.json"
    npx --yes lighthouse@12 "https://localhost:$PROXY_PORT/register" \
      --only-categories=performance --throttling-method="$mode" \
      --output=json --output-path="$f" \
      --chrome-flags="--headless=new --no-sandbox --ignore-certificate-errors" \
      --quiet > "$OUT/lighthouse-$mode-$n.log" 2>&1
    sleep 2
    echo "=== $mode, run $n"
    node -e '
      const r = require(require("path").resolve(process.argv[1])); const a = r.audits;
      if (!r.categories) { console.log("  (run failed - see .lighthouse/lighthouse-*.log)"); process.exit(0); }
      console.log("  score", Math.round(r.categories.performance.score * 100));
      for (const k of ["first-contentful-paint","largest-contentful-paint","speed-index","total-blocking-time","cumulative-layout-shift"]) console.log("  " + k, a[k].displayValue);
      const it = a["largest-contentful-paint-element"].details?.items || [];
      console.log("  LCP element:", (it[0]?.items?.[0]?.node?.snippet || "").slice(0, 90));
      console.log("  LCP phases:", JSON.stringify((it[1]?.items || []).map(i => [i.phase, Math.round(i.timing)])));
    ' "$f"
  done
done

pkill -f "next start -p $NEXT_PORT" 2>/dev/null; pkill -f h2-fairshare-proxy.mjs 2>/dev/null
