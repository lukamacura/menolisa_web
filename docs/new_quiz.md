# New Quiz Plan — ZOE-Inspired Upgrade for `/register`

> **Goal:** Borrow the highest-converting mechanics from the ZOE MenoScale quiz (severity-rated symptoms, a benchmarked score, and a "you're not alone" comparison) and fold them into the existing `/register` quiz **without changing the active funnel** — same phase machine, same auth, same save-quiz contract, same paywall/Stripe, same `/quiz1` hand-off.

---

## 0. TL;DR

- **Only one quiz step truly changes:** `q4_symptoms` goes from binary multi-select → select + **severity rating (1–4)**, the ZOE mechanic that makes the score feel real.
- **Three borrowed mechanics:** (1) severity scale, (2) age-cohort benchmark on the results score, (3) top-3 "You vs. average" comparison bars.
- **Zero backend changes required.** Severity ratings map back to the existing `top_problems[]` + `severity` string that `/api/auth/save-quiz` already accepts. The funnel contract is untouched.
- **One real decision to make:** score direction (MenoLisa's current "higher = better, target 80+" vs. ZOE's "higher = worse burden"). See §6. Recommendation inside.
- **One honesty flag:** ZOE uses real cohort averages. We don't have that data yet — benchmarks must be defensible or clearly labelled. See §7.

---

## 1. Strategic intent (marketing read)

ZOE's quiz converts because of three emotional beats we currently lack:

| ZOE beat | Why it works | Do we have it? |
|---|---|---|
| **Severity-rated symptoms (1–4)** | Makes the resulting score feel measured, not guessed. Higher perceived accuracy → higher trust in the recommendation. | ❌ We use binary select (count-based score). |
| **"Your score is higher than average"** | Social comparison + mild alarm = motivation to act. A number alone is inert; a number *relative to peers* creates urgency. | ❌ Our score is absolute, no benchmark. |
| **"You're not alone" top-3 comparison** | Validates her experience (empathy) *and* quantifies it (you're in the hard tail). Both reduce churn and justify the paywall. | ❌ We show symptom pills only. |

What ZOE does that we should **not** copy:
- **20 symptoms, all force-rated.** Too long for cold paid-social traffic; high drop-off risk. We keep our 8 and only rate the ones she selects.
- **Height/weight with unit toggles + HRT medical sub-flow.** Clinical friction that suits ZOE's research brand, not our 60-second conversion funnel. We already capture rough equivalents (`q2_here_for` ≈ menopausal status, `q5_what_tried` includes HRT).
- **Standalone "Nutrition Guide / explainer" email deliverables.** Different lead magnet model; out of scope.

---

## 2. The active funnel — DO NOT TOUCH

These are load-bearing and explicitly out of scope for changes:

- **Phase machine** in `app/register/page.tsx`: `quiz → calculating → email → results → paywall → download`.
- **OTP auth** (`components/auth/OtpForm.tsx`) and the email gate.
- **`/api/auth/save-quiz`** zod schema and the `user_profiles` / `user_trials` writes (`app/api/auth/save-quiz/route.ts`).
- **`/quiz1` hand-off** (`quiz1_completed` / `quiz1_profile` → skip quiz, jump to email → paywall).
- **Paywall + Stripe** (`PaywallView`, `/api/stripe/*`).
- **Step framework**: progress dots, illustrations (`QUIZ_ILLUSTRATION`), `STEPS[]` navigation, back/next.

The entire upgrade lives **inside the `quiz` and `results` phases** and in **client-side scoring helpers**. Nothing downstream of the email gate changes shape.

---

## 3. Keep / Drop / Transform

| Current step | Decision | Notes |
|---|---|---|
| `q1_age` | **Keep** | Required input for the cohort benchmark (§7). Already collected — no extra friction. |
| `q2_here_for` (peri/meno/supporting/curious) | **Keep** | Stands in for ZOE's "menopausal status." |
| `q3_goals` | **Keep** | Drives goal-promise copy + pillar selection. |
| `q4_symptoms` (binary multi-select) | **Transform** | Becomes select → severity-rate (1–4). The one real structural change. See §4. |
| `breather` | **Keep** | Pacing screen; good place to set up the score reveal. |
| `q5_what_tried` (incl. HRT) | **Keep** | Covers ZOE's HRT question. |
| `q6_how_long` | **Keep** | Duration feeds severity derivation. |
| `q7_qualifier` | **Keep** | Drives CTA copy (`getCtaCopy`). |
| `q8_name` | **Keep** | Personalization throughout results. |

Net: **8 steps stay, 1 transforms, 0 removed.** Optionally +1 sub-step for severity rating (see §4 for the one-step vs. two-step tradeoff).

---

## 4. Mechanic 1 — Severity-rated symptoms (the core change)

ZOE rates every symptom on a 4-point scale: **Not at all · A little · Quite a bit · Extremely**.

We adopt the same scale, but **only on the symptoms she selects** (keeps it short).

### Two implementation options

**Option A — Inline severity (recommended, single step).**
Keep `q4_symptoms` as one step. Each symptom row, once tapped/selected, reveals a compact 4-segment severity selector inline ("How much?"). Unselected = "Not at all" (0).
- Pros: no extra step, no added drop-off, feels modern.
- Cons: denser UI; needs careful mobile layout at 375px.

**Option B — Two-stage (select, then rate).**
`q4_symptoms` stays selection-only; add `q4b_severity` that lists only the selected symptoms with the 4-point scale each.
- Pros: cleaner, closest to ZOE, easy to build.
- Cons: +1 step = measurable drop-off on a cold-traffic funnel; progress dots go from 9 → 10.

> **Recommendation: Option A.** It preserves the 9-step length (no new drop-off point) while still producing a real severity vector. If engineering finds the inline layout too cramped on small screens, fall back to Option B and accept the extra step.

### Severity scale (shared constant)
```
1 = Not at all   (0 pts)
2 = A little      (1 pt)
3 = Quite a bit   (2 pts)
4 = Extremely     (3 pts)
```
(0-indexed points keep "Not at all" neutral in the score.)

### State change
Replace `topProblems: string[]` with a severity map, while **deriving** the old array for compatibility:
```ts
// new state
const [symptomSeverity, setSymptomSeverity] = useState<Record<string, number>>({}); // id -> 0..3
// derived for funnel compatibility (unchanged downstream contract):
const topProblems = Object.keys(symptomSeverity).filter((id) => symptomSeverity[id] > 0);
```
`stepIsAnswered("q4_symptoms")` → `topProblems.length > 0` (same rule as today).

---

## 5. Mechanic 2 — Benchmarked score (results)

ZOE: *"Your score is higher than average"* + bar showing where she sits vs. peri/post averages for her age cohort.

We add the same to the results score card (currently the `Your Menopause Score` block, `app/register/page.tsx` ~L803–837):
- A **benchmark marker** on the existing score bar at the cohort average position.
- A **headline verdict**: "higher than average" / "about average" / "lower than average" for her age band.
- **Cohort label** from `ageBand` (e.g. "women aged 46–50").

This reuses the existing bar component — it's an additive marker + one line of copy, not a redesign.

---

## 6. Score redesign + the direction decision

**This is the one genuine product decision and it affects copy across the results page.**

Today's score (`calculateQualityScore`, ~L183) is a **quality-of-life score**: starts at 100, subtracts for symptoms/severity/duration, **clamped 31–52**, framed as *"higher = better, target 80+."*

ZOE's MenoScale is a **symptom-burden score**: **higher = worse**, compared to a cohort average (her 50 vs. avg 31).

These run in **opposite directions.** Pick one — don't show both (confusing).

| | Option 1 — Keep "higher = better" (quality) | Option 2 — Adopt ZOE "higher = worse" (burden) |
|---|---|---|
| Funnel/copy impact | **Low** — keep existing "target 80+" copy; benchmark reads "below average for your age = it's hitting you harder." | **High** — rewrite all results copy (headline, "target 80+", bar colours, score-color logic). |
| Familiarity to existing users | High | None (new framing) |
| Comparison punchiness | Good ("you're below where most women your age are") | Strongest ("your burden is higher than average") — matches ZOE 1:1 |
| Effort | Low | Medium |

> **Recommendation: Option 1 (keep direction), upgrade the math.** Stay with "higher = better, target 80+" to avoid rewriting the results phase and contradicting existing brand copy, but replace the count-based formula with a **severity-weighted** one so the number is defensible:

```ts
// severity-weighted quality score (higher = better), replaces count-based clamp
function calculateQualityScore(sev: Record<string, number>, timing: string, tried: string[]) {
  const totalBurden = Object.values(sev).reduce((a, b) => a + b, 0); // 0..(3*8=24)
  let score = 100 - totalBurden * 2.5;            // severity drives the score, not raw count
  score -= DURATION_PENALTY[timing] ?? 5;         // unchanged duration penalty
  if (tried.length > 0 && !tried.includes("nothing")) score += 3;
  return Math.max(20, Math.min(60, Math.round(score))); // widen floor so severe cases read worse
}
```
Severity now moves the needle (someone with 3 "Extremely" symptoms scores far worse than 3 "A little"), which is the whole point of adopting the scale. If marketing prefers the raw ZOE punch, escalate to Option 2 as a follow-up A/B test.

---

## 7. Mechanic 3 — "You're not alone" comparison + benchmark data

ZOE shows her **top-3 symptoms** as "You (yellow) vs. average for similar women (red)."

Plan:
- Take the 3 highest-severity symptoms from `symptomSeverity`.
- Render two bars per symptom (her severity vs. cohort average) using simple div bars (matches existing results style; `recharts` is available if we want polish but div bars are lighter).
- Section heading: "You're not alone" + sub: comparing to women in her age band.

### ⚠️ Benchmark honesty flag (must resolve before ship)
ZOE quotes real cohort data (avg 31/32 for 41–45). **We don't have that.** Per the funnel memory ("no filler / fake unlock"), fabricated peer stats are a brand risk. Options, best → worst:
1. **Derive defensibly:** define a transparent "typical" severity profile per age band and label it *"based on common symptom patterns"* (not "average of N women").
2. **Source real numbers:** pull anonymized averages from our own `symptom_logs` / `user_profiles` once we have volume, then label honestly with the cohort size.
3. **Avoid hard numbers:** show her bars as "high / moderate" zones without claiming a specific peer average.

> **Recommendation:** Ship with (1) now (honest, defensible, no false precision), migrate to (2) once we have enough data. Never invent a specific "average of X women" we can't back.

---

## 8. Data model / API impact — **none required**

The funnel contract stays intact because severity is mapped back to the existing fields:

| New client data | Maps to existing save-quiz field | How |
|---|---|---|
| `symptomSeverity: Record<string,number>` | `top_problems: string[]` | keys where severity > 0 (deduped, ≤ 8, well under the schema's max 20) |
| overall severity | `severity: "mild"\|"moderate"\|"severe"` | recompute `deriveSeverity` from total burden instead of count (see below) |
| (unchanged) | `timing`, `tried_options`, `goal`, `name` | as today |

`deriveSeverity` upgrade (still returns the same 3 strings the contract expects):
```ts
function deriveSeverity(totalBurden: number, howLong: string): "mild"|"moderate"|"severe" {
  const long = howLong === "over_year" || howLong === "several_years";
  if (totalBurden >= 10 && long) return "severe";
  if (totalBurden >= 6 || long)  return "moderate";
  return "mild";
}
```

Because `save-quiz`, `user_profiles`, OTP, paywall, and `/quiz1` all consume only `top_problems[]` + `severity` (strings/arrays), **they keep working with zero changes.** This is the crux of "without changing the active funnel."

> Optional later: persist the full severity map. Would require a new nullable column (e.g. `symptom_severity jsonb`) on `user_profiles` and a schema field — **out of scope for this pass** to keep the contract frozen.

---

## 9. Implementation phases

### Phase 1 — Severity scale (core)
- Add `SEVERITY_SCALE` constant + `symptomSeverity` state.
- Convert `q4_symptoms` to Option A inline-severity UI (fallback B if cramped).
- Derive `topProblems` from the map; keep `stepIsAnswered` rule identical.
- Update `saveQuizAnswers` / `handleOtpSuccess` to derive `severity` from total burden. **No payload shape change.**
- Verify `/quiz1` path still bypasses correctly (it never enters this step).

### Phase 2 — Scoring
- Replace `calculateQualityScore` with severity-weighted version (§6, Option 1).
- Update `deriveSeverity` to burden-based (§8).
- Keep score-color / "target 80+" copy as-is (Option 1 keeps direction).

### Phase 3 — Results benchmark + comparison
- Add cohort benchmark marker + verdict line to the score card (§5).
- Add "You're not alone" top-3 comparison bars (§7), using defensible benchmark profile (§7 option 1).
- Cohort label from `ageBand`.

### Phase 4 — QA
- 375px mobile layout for inline severity.
- Full funnel smoke test: quiz → calculating → email/OTP → results → paywall → Stripe → download.
- `/quiz1 → register` hand-off unaffected.
- Confirm `save-quiz` payload still validates (it will — same fields).

### Files touched
- `app/register/page.tsx` — quiz step `q4`, scoring fns, results card + new comparison block. **(primary)**
- `lib/quiz-results-helpers.ts` — optional new helper for benchmark profile + comparison data. **(additive)**
- *(No changes:* `app/api/auth/save-quiz/route.ts`, `OtpForm.tsx`, `PaywallView`, middleware, Stripe, `/quiz1`.*)*

---

## 10. Risks & open questions

| Risk / question | Mitigation |
|---|---|
| Inline severity too dense at 375px | Fall back to two-stage (Option B), accept +1 step. |
| Extra friction lowers completion | Severity only on selected symptoms (not all 8); single step (Option A). |
| Benchmark looks fabricated → brand risk | Use defensible labelled profile now; real data later (§7). |
| Score-direction confusion if both shown | Pick ONE direction (recommend Option 1). |
| `/quiz1` users skip this entirely | Intended — they jump to email; no severity collected, payload already null-tolerant. |

### Decisions needed from you before build
1. **Score direction:** keep "higher = better / target 80+" (Option 1, low effort) or switch to ZOE "higher = worse" (Option 2, full results rewrite)?
2. **Severity UX:** inline single-step (A) or two-stage (B)?
3. **Benchmark source:** defensible-profile now (recommended) vs. wait for real data?

---

## 11. Explicitly out of scope (this pass)
- Height/weight inputs with unit toggles.
- Standalone "Nutrition Guide" / email lead-magnet deliverables.
- Persisting the full severity map to the DB (new column).
- Changing the `/quiz1` funnel or the paywall/Stripe flow.
- Expanding beyond the existing 8 symptoms to ZOE's ~20.
