import { cn } from "@/lib/utils";

/**
 * A strip of washi tape holding one corner of a print to the page.
 *
 * One component for every taped print on the site - the paywall's and the
 * reward board's `<SocialProofPolaroid />` and the funnel entrance's
 * `<EntranceProof />` - so the tape reads as the same roll everywhere. Two
 * copies drift: a slightly different tint or corner radius on one screen
 * and the scrapbook stops looking like one person's scrapbook.
 *
 * `size` is the strip's footprint: `md` for the full-size print, `sm` for a
 * thumbnail where a 64px strip would be wider than the photograph.
 */
export function Tape({
  className,
  size = "md",
}: {
  className: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute rounded-[2px] shadow-sm",
        size === "md" ? "h-5 w-16" : "h-3 w-9",
        "bg-[rgba(233,222,199,0.78)] ring-1 ring-black/5",
        "before:absolute before:inset-0 before:rounded-[2px] before:bg-linear-to-b before:from-white/45 before:to-transparent",
        className
      )}
    />
  );
}
