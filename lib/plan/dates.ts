/**
 * Plan date maths, on plain `YYYY-MM-DD` strings in UTC.
 *
 * Every plan read — the API route, the history grid, the cycle rollover — walks
 * days the same way, and each used to carry its own copy of these four lines.
 * UTC on purpose: the client tells us its local date and we only ever add or
 * subtract whole days from it, so the server's own zone and DST must never
 * take part.
 */

const DAY = 86_400_000;

export const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export const addDays = (d: string, n: number) =>
  new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) =>
  Math.floor((asUtc(to) - asUtc(from)) / DAY);
