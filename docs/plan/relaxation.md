# Relaxation — the breathing patterns, and why they're timed that way

Defined in `RELAXATION` in `lib/plan/catalog.ts`. The API returns the phases and
round count on the task itself (`relaxation` field), so the app runs the timer
from data — it never hardcodes a protocol of its own.

## Three rules every pattern obeys

1. **Exhale is at least 1.5× the inhale.** The asymmetry is what shifts the
   nervous system. The absolute length barely matters; the ratio does.
2. **No breath-hold in anything meant for a hot flash or a spike.** A hold
   amplifies the closed-throat, can't-get-enough-air feeling that rides along
   with a flash, and turns a symptom into a panic. Holds appear only in the sleep
   pattern, where she's lying down and nothing is spiking.
3. **Nothing over a 5-second inhale.** A big forced inhale flushes the face and
   can start the very thing she's trying to stop.

## The patterns

| id | Label | Pattern | Cycle | Rounds | Total | Reach for it when |
|---|---|---|---|---|---|---|
| `breath_426` | 4-2-6 breathing | in 4 · hold 2 · out 6 | 12s (5/min) | 10 | 2:00 | Daily anchor, any time |
| `breath_hotflash` | Hot flash rescue breathing | in 4 · out 8 | 12s (5/min) | 8 | 1:36 | The moment one starts |
| `breath_paced_6` | Paced respiration | in 5 · out 5 | 10s (6/min) | 90 | 15:00 | Morning and evening |
| `breath_sleep` | Sleep wind-down breathing | in 4 · hold 4 · out 8 | 16s (3.8/min) | 8 | 2:08 | In bed, or the 3am wake |
| `breath_sigh` | Double-breath reset | in 4 · sip in 1 · out 8 | 13s (4.6/min) | 5 | 1:05 | Racing heart, sudden dread |
| `slow_breath_meal` | Slow breathing before you eat | in 4 · out 6 | 10s (6/min) | 5 | 0:50 | Before the first bite |

Plus three non-breathing practices: `winddown_10` (10 min), `body_scan` (8 min),
`reset_pause` (5 min).

## Why those specific doses

**`breath_426` is the funnel's pattern, unchanged.** She does 3 rounds / 36
seconds at `phase === "relief"` in `/register`, before she has paid for anything.
The app opens on the same rhythm she has personally already felt work — that
continuity is the point, so do not "improve" the ratio on one side only. Both
copies must move together: `BREATH_SEQUENCE` in `app/register/page.tsx` and
`breath_426` here.

**`breath_paced_6` gets a real 15-minute dose** because it is the only one on
this list with trial evidence behind the dose rather than the mechanism — paced
respiration at 6 breaths/min, 15 minutes twice daily, is the protocol that was
actually tested against hot flash frequency. Everything else here is a 1-2 minute
intervention and is dosed like one.

**`breath_sleep` is the only pattern with a 4-second hold.** She is horizontal,
not mid-flash, and the longer cycle (3.8 breaths/min) is the slowest on the list
— which is what you want on the way down, and exactly what you don't want when
she's already too hot.

**`breath_sigh` is the double inhale**, not a slow one. A racing heart in
perimenopause is usually adrenaline rather than the heart, and the double-inhale
then long release is the fastest route down from it. Five rounds is enough; more
tends to make her light-headed.

## Matching the pattern to her symptom

The prompt tells the model to route by worst symptom — hot flashes to
`breath_hotflash`, night waking to `breath_sleep`, anxiety or palpitations to
`breath_sigh`. This is a soft rule: nothing in `sanitize()` enforces it, because
a mismatched-but-valid practice is still a good practice, and forcing it would
mean writing the symptom→pattern table twice.

If it drifts noticeably in production, move the routing into `sanitize()` rather
than adding more emphasis to the prompt.
