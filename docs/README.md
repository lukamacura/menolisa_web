# MenoLisa docs

The `/register` funnel, the paywall and the access rules are documented in
`CLAUDE.md` (§4), not here — the code is the only thing that changes them, and a
second copy drifts. What lives here is the material that is *not* readable off
the source: the mobile contract, the plan's design, and the chat pipeline review.

| Folder | What's in it |
|---|---|
| [plan/](plan/) | The 8-week plan — how it's generated, the exercises, the daily pillars |
| [marketing/](marketing/) | Positioning and the funnel's emotional model |
| [rag/](rag/) | Lisa's chat pipeline |

## Start here

- **The API contract the Expo app follows** → [mobile-app-changes.md](mobile-app-changes.md)
- **How the 8-week plan works** → [plan/instructions.md](plan/instructions.md)
- **The plan in plain language, for anyone** → [plan/how-the-plan-works.html](plan/how-the-plan-works.html)
- **What the LLM actually stores per user** → [plan/generated-plan.md](plan/generated-plan.md)
- **The Stripe product copy** → [stripe-product.md](stripe-product.md)

## Docs that code depends on

These are referenced from source comments. Changing them alone won't change
behaviour — update the code in the same commit.

| Doc | Code that mirrors it |
|---|---|
| [plan/instructions.md](plan/instructions.md) | `lib/plan/generate.ts` |
| [plan/exercises.md](plan/exercises.md) | `lib/plan/catalog.ts` |
| [plan/pillars.md](plan/pillars.md) | `NUTRITION` in `lib/plan/catalog.ts`, `NUTRITION_GROUPS` in `app/register/page.tsx` |

[plan/exercise-catalog.md](plan/exercise-catalog.md) is a generated reading copy
of the `E` table in `lib/plan/catalog.ts` — regenerate it, never hand-edit it.
