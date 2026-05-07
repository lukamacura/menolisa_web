# Claude Code Prompt — Build /quiz1 for MenoLisa

## Context
MenoLisa is an AI-powered menopause companion ("Your AI bestie for the meno chaos") helping women through metabolic changes across 6 pillars: Movement, Nutrition, Sleep, Stress, Supplements, HRT.

We are building a new route `/quiz1` in the existing NextJS app. This is a **top-of-funnel conversion tool for cold paid social traffic (TikTok / Instagram)** — a 60-second guided self-assessment that hands her off to `/register`.

The quiz is not a medical diagnostic. It is a warm, knowing self-reflection that creates an "I'm seen" moment and earns the registration ask.

## Goal
Move a cold visitor from "curious" to "I want this in my life" in under 90 seconds, by:

- Letting her recognise herself in the questions (low-stakes openers).
- Generating a sense of personalisation before any data is collected.
- Funnelling every completed quiz to `/register` with a single, obvious CTA — and **without making her redo a second quiz** in register.

---

## Funnel Position & Hand-off to /register

`/register` currently runs an 8-question onboarding quiz → calculating → email OTP → results → paywall (Stripe, card required). For cold paid-social traffic, we are bypassing the register quiz entirely.

### The flow we want for quiz1 users
`quiz1 hook → quiz1 Q1–Q6 → quiz1 result → /register (email phase only) → OTP → paywall → card`

The register quiz is **skipped** for users who arrive from quiz1.

### How quiz1 signals the skip
On Q6 answer, quiz1 writes to `sessionStorage`:

- `quiz1_state` — the answer object (see State shape below)
- `quiz1_completed` — `"true"`
- `quiz1_profile` — a derived object that maps cleanly into the `quizAnswers` payload `/api/auth/save-quiz` expects (see "save-quiz payload mapping" below). All fields optional in the zod schema, so we send what we have, leave the rest null/empty.

### Required `/register` change (separate task — flag in PR description)
On mount, `/register/page.tsx` must:

1. Read `sessionStorage.quiz1_completed`.
2. If `"true"`: set the initial `Phase` to `"email"` (skip `"quiz"` and `"calculating"`).
3. When the email/OTP step calls `/api/auth/save-quiz`, use `sessionStorage.quiz1_profile` as the `quizAnswers` payload instead of building one from the register-quiz state.
4. After successful save-quiz, jump to `"paywall"` (skip the `"results"` phase too — quiz1 already showed her the result; showing it again wastes the momentum).

So the register page recognises "I'm being used as the email/payment shell, the quiz was already done elsewhere" and acts accordingly.

### save-quiz payload mapping
Quiz1 answers → `quizAnswers` fields. Send only what we can derive cleanly; leave the rest null/empty (zod schema permits this — verified):

| Quiz1 answer | Mapped into `quizAnswers` |
|---|---|
| Q1 Sleep: "Hot flashes are fragmenting my nights" | `top_problems` += `["hot_flashes", "sleep_issues"]` |
| Q1 Sleep: "Under 7 hours most nights" / "Disrupted by alcohol…" / "All over the place…" | `top_problems` += `["sleep_issues"]` |
| Q2 Stress: "Honestly, I'm white-knuckling it right now" | `top_problems` += `["anxiety"]` |
| Q5 Supplements: any answer except "Nothing right now" | `tried_options` += `["supplements"]` |
| Q6 HRT: any "On…" or "Using…" option | `tried_options` += `["hrt"]` |
| All quiz1 questions | `tried_options` += `["apps"]` (she's literally using one to take this quiz) |

`top_problems` and `tried_options` are deduplicated arrays. `name`, `severity`, `timing`, `goal`, `doctor_status` are sent as `null`/omitted — user can fill them in dashboard settings later. Name can also be captured at the email step if desired (low-priority enhancement).

Do **not** pass quiz answers via URL params. Keep the URL clean.

### On the card requirement
Keep it. Current architecture already captures email *before* the card (OTP creates the user → save-quiz creates trial row in `pending_payment` → paywall). That means abandoned-card users are already in the Resend drip sequence — the safety net exists. Removing the card requirement is a separate experiment (see Follow-up tasks).

To soften the card surprise for cold quiz1 traffic, the register paywall screen should be reviewed (separate PR) to lead with concrete trial framing: *"3 days free. Cancel anytime in one tap. We'll remind you 24h before charge."*

---

## Tech Constraints

- NextJS App Router, TypeScript, TailwindCSS v4.
- Framer Motion is already installed (`framer-motion ^12.23.24`) — use it.
- Fully client-side. No backend, no API calls, no auth in the quiz itself.
- Persist progress in `sessionStorage` so a refresh doesn't kill the funnel. Hydrate on mount.
- Mobile-first (≥80% of traffic mobile). Test at 375px width minimum.

---

## Brand & Visual Direction
Match existing MenoLisa identity:

- Background: deep aubergine / plum purple
- Primary CTA: warm tan / beige (the "go" colour throughout)
- Selection / accent: dusty pink
- Typography: project's existing font stack (`--font-satoshi`, `--font-poppins`)
- Tone: warm, smart, knowing. Clued-in friend. Never clinical. Never patronising.

---

## Page Architecture
Five screen states, smooth transitions between them:

1. **Hook screen** — pattern-interrupt for cold social traffic. Headline + subhead + tan "Start" button.
2. **Question screens (Q1–Q6)** — one per screen. Tappable option cards. Top-of-screen thin progress bar (no "Question X of 6" text — bar alone is calmer). Back arrow top-left.
3. **Loading screen** — 1.8s "Lisa is mapping your profile…" with subtle pulse. Perceived-effort beat.
4. **Result screen** — names her **2** focus pillars (two converts better than three — less overwhelming, more believable). Includes a screenshot-friendly result card.
5. **Hand-off / CTA** — single tan CTA → `/register`. Result and CTA can share a screen as long as CTA is above the fold at 375px height.

---

## Question Content & Ordering (REVISED)

Reordered so Q1 is the lowest-stakes, highest-recognition question. Movement and supplements (the "have I done my homework" questions) are pushed mid/late.

### Q1 — Sleep *(opener — universal, validating, no shame)*
"How would you describe your sleep right now?"

- Solid 7–9 hours, consistent wake time
- Hot flashes are fragmenting my nights
- Under 7 hours most nights
- Disrupted by alcohol or late meals
- All over the place — schedule changes a lot

### Q2 — Stress
"What do you currently lean on when stress hits?"

- Breathwork or meditation
- Cold showers
- Long walks in nature
- Calling a friend / social connection
- Honestly, I'm white-knuckling it right now

### Q3 — Nutrition
"Which of these sounds most like how you eat?"

- Protein first at every meal (around 30g)
- Tracking fiber daily (25–35g from veg, legumes, oats)
- Most of my carbs land around exercise
- I avoid liquid sugar and go light on alcohol
- I eat inside an 8–10 hour window
- None of these — my eating is pretty unstructured

### Q4 — Movement *(moved later — by here she is invested)*
"Which type of movement fits into your week most often right now?"

- Strength training, 2–3x/week
- HIIT, even just 10 minutes, 2x/week
- Walking after meals, 10–15 minutes
- Yoga or resistance bands
- Honestly, none of these consistently

### Q5 — Supplements *(SIMPLIFIED to single-select buckets to preserve auto-advance rhythm)*
"Where are you with supplements right now?"

- I take a few targeted ones for meno (e.g. magnesium, omega-3, D3)
- Just a multivitamin
- I'm experimenting / figuring it out
- Nothing right now

> **Why simplified:** Original spec listed 7 brand-name compounds (Berberine, Inositol myo+d-chiro, Chromium picolinate) on a multi-select with a Continue button. This was the only break in auto-advance rhythm and the highest cognitive-load screen. Specific stack details get collected post-registration where the audience is committed.

### Q6 — HRT
"Where are you with HRT?"

- On transdermal estradiol (patch or gel)
- On oral estrogen
- Using micronised progesterone
- Using synthetic progestins (MPA)
- Considering HRT, haven't started
- Not on HRT, and not considering right now

---

## Hook Screen Copy

**Headline:** "Find your meno blind spot in 60 seconds."

**Subhead:** "Six questions across the six things that actually move the needle in menopause. No email. No fluff."

**Button (tan):** "Start"

(Optional dusty-pink line of social proof beneath button — only if true: e.g. "Built with women in perimenopause and beyond." Otherwise omit.)

---

## Interaction Rules

- **All questions are single-select** with auto-advance 250ms after tap. No "Next" button anywhere. Every removed tap is a conversion gain.
- **Back arrow:** preserves all previously chosen answers. Going back and changing an answer does not reset progress.
- **Transitions:** slide-and-fade, ~300ms. Smooth, not flashy.
- **Touch targets:** minimum 56px tall, generous vertical spacing.
- **Tap feedback:** brief `transform: scale(0.97)` on press.

---

## Result Screen Logic

After Q6, identify the user's **2 weakest pillars**. A pillar is "weak" if she chose:

- "None of these" / "Honestly…" / "Not on HRT, and not considering" / "I'm white-knuckling it" type answers
- Active-disruption answers on Sleep ("hot flashes are fragmenting…", "under 7 hours…", "disrupted by alcohol…", "all over the place…")

Pick the **two highest-leverage** weak pillars. If only one is weak, pad with the second-weakest. If none are weak, use the all-strong fallback.

### Result copy structure

**Headline (gives her a win first — reciprocity, then opportunity):**
> "You're already onto something with {strong pillar}. Where most women your stage see the fastest shifts is **{Pillar A}** and **{Pillar B}** — that's where Lisa starts."

**Screenshot-friendly result card** (branded, clean, share-able):
- "Your meno focus areas"
- {Pillar A} · {Pillar B}
- Subtitle: "Mapped from your answers"

**Three trust micro-points:**
- Built with menopause specialists
- Personalised to your symptoms
- 24/7 support — no appointments

**CTA (tan, full-width on mobile):**
> "Show me my plan" → `/register`

(Leverages curiosity-completion — she wants to see what was generated. A/B test variants in a follow-up.)

### All-strong fallback
If she answered strongly across the board, do **not** tell her she's doing it all right (kills the reason to register). Use:
> "You're doing the foundation work. Lisa will refine the layered detail across all 6 pillars with you — sleep timing, supplement stacking, training periodisation."

Result still surfaces 2 pillars (default to Movement + Stress if no signal).

---

## State & Persistence

State shape:
```ts
type Quiz1State = {
  sleep?: string;       // option id
  stress?: string;
  nutrition?: string;
  movement?: string;
  supplements?: string;
  hrt?: string;
  completedAt?: string; // ISO when Q6 answered
}
```

- Save to `sessionStorage["quiz1_state"]` on every answer change.
- On mount, hydrate from `sessionStorage` if present.
- On Q6 answer, also write:
  - `sessionStorage["quiz1_completed"] = "true"`
  - `sessionStorage["quiz1_profile"]` — the derived `quizAnswers` payload per "save-quiz payload mapping" above
- Do **not** pass answers as URL params to `/register`.

---

## Analytics Events (REQUIRED — do not ship without these)

Without per-question drop-off data we cannot optimise paid-social CAC.

Fire to whatever analytics layer the app uses (check `lib/` for an existing `track()` helper; if none, create `lib/analytics.ts` with a thin `track(event, props)` wrapper that logs to console + has a TODO to wire to the chosen provider).

Events:
- `quiz1_view_hook`
- `quiz1_start` — tap on hook CTA
- `quiz1_q_answered` — `{ question: 1..6, pillar: string, optionId: string, msSinceQuestionShown: number }`
- `quiz1_back` — `{ fromQuestion: number }`
- `quiz1_complete` — `{ weakPillars: string[], totalDurationMs: number }`
- `quiz1_cta_click` — `{ weakPillars: string[] }` — fires before navigation to `/register`

Q5 will be the canary for drop-off — watch it.

---

## Mobile-Specific Requirements

- `100dvh` for full-height screens, not `100vh` (iOS Safari URL bar).
- `touch-action: manipulation` on interactive elements (removes 300ms tap delay).
- No hover-only states — every visual cue must work on tap.
- No horizontal scroll, ever. Test landscape on a small phone too.
- Tactile feedback: `transform: scale(0.97)` on press.

---

## Accessibility

- Every option is a real `<button>`, not a div.
- Visible focus rings for keyboard nav.
- Progress and screen changes announced via `aria-live`.
- Selection state conveyed by more than colour alone (border + check icon).

---

## What NOT to Do

- Don't ask for email, name, or any PII inside quiz1. Registration is the conversion event — don't dilute it.
- Don't use clinical or diagnostic language.
- Don't add a "Skip" or "Take quiz later" link. Completion is the only happy path.
- Don't render the result without the CTA visible above the fold on a 375px-height screen.
- Don't over-animate. Smooth beats flashy. One animation per state change.
- Don't tell her she's "doing it all right" on the result screen — kills the reason to register.

---

## File Structure to Create

Component location follows the existing project pattern (`components/auth/`, `components/landing/`, etc.) — **not** `app/quiz1/components/`.

- `app/quiz1/page.tsx` — entry point, owns state and screen routing
- `components/quiz1/HookScreen.tsx`
- `components/quiz1/QuestionScreen.tsx`
- `components/quiz1/LoadingScreen.tsx`
- `components/quiz1/ResultScreen.tsx`
- `components/quiz1/data/questions.ts` — typed array of all 6 questions and options
- `components/quiz1/lib/state.ts` — state shape, weakness-detection logic, sessionStorage helpers, save-quiz payload mapping
- `lib/analytics.ts` — thin `track()` wrapper if not already present

---

## Definition of Done

- Loads instantly on mobile, no layout shift on first paint.
- All 6 questions advance smoothly, no janky transitions.
- Refreshing mid-quiz restores progress.
- Result names exactly 2 focus pillars based on actual answers (or the all-strong fallback).
- Tap on CTA navigates cleanly to `/register`.
- `sessionStorage.quiz1_completed` and `sessionStorage.quiz1_profile` are populated on completion and inspectable in DevTools.
- All analytics events fire and are visible in the analytics provider (or in console if stub).
- Lighthouse on mobile: Performance ≥ 90, Accessibility ≥ 95.
- Visually consistent with existing MenoLisa palette and tone — not a generic quiz template.

---

## Follow-up tasks (separate PRs — flag in this PR's description, do not implement here)

1. **Wire `/register` to honour quiz1 hand-off.** On mount, if `sessionStorage.quiz1_completed === "true"`, start at `Phase = "email"`, use `sessionStorage.quiz1_profile` as the save-quiz payload, and skip the `"results"` phase straight to `"paywall"`. Without this, quiz1 traffic still hits the 8-question register quiz and the funnel is broken.
2. **Pre-paywall framing in `/register` paywall step** — soften card-required surprise. Lead with: *"3 days free. Cancel anytime in one tap. We'll remind you 24h before charge."*
3. **A/B test result CTA copy** — "Show me my plan" vs. "Get my personalised plan" vs. "Start my free trial".
4. **A/B test soft-paywall** (e.g. 3 free Lisa messages before card) as a separate experiment. Email is already captured pre-card via OTP, so the Resend drip safety-net is intact either way.
