# MenoLisa docs

| Folder | What's in it |
|---|---|
| [plan/](plan/) | The 8-week plan — how it's generated, the exercises, the daily pillars |
| [funnel/](funnel/) | The `/register` quiz and the paywall |
| [marketing/](marketing/) | Positioning, funnel stages, the offer |
| [rag/](rag/) | Lisa's chat pipeline |
| [archive/](archive/) | Finished implementation plans, kept for reference |

## Start here

- **How the 8-week plan works** → [plan/instructions.md](plan/instructions.md)
- **What we actually sell** → [marketing/offering.md](marketing/offering.md)
- **How the funnel is built** → [funnel/quiz.md](funnel/quiz.md)

## Docs that code depends on

Two of these are referenced from source comments. Changing them alone won't change
behaviour — update the code in the same commit.

| Doc | Code that mirrors it |
|---|---|
| [plan/instructions.md](plan/instructions.md) | `lib/plan/generate.ts` |
| [plan/exercises.md](plan/exercises.md) | `lib/plan/catalog.ts` |
| [plan/pillars.md](plan/pillars.md) | `NUTRITION` in `lib/plan/catalog.ts`, `NUTRITION_GROUPS` in `app/register/page.tsx` |
