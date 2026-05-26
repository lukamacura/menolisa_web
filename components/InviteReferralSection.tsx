"use client";

import { useState, useEffect, useCallback } from "react";
import { Gift, Copy, Share2 } from "lucide-react";

type InviteCopyState = "eligible" | "already_used" | "no_referrals" | "subscribed";

const INVITE_COPY_KEYS: InviteCopyState[] = [
  "eligible",
  "already_used",
  "no_referrals",
  "subscribed",
];

function isInviteCopyState(s: unknown): s is InviteCopyState {
  return typeof s === "string" && INVITE_COPY_KEYS.includes(s as InviteCopyState);
}

const INVITE_COPY: Record<
  InviteCopyState,
  { title: string; subtitle: string; shareText: string }
> = {
  eligible: {
    title: "50% off your next invoice.",
    subtitle:
      "Your friend gets 3 days free; you get 50% off your next MenoLisa invoice — applied automatically.",
    shareText: "Try MenoLisa - 3 days free.",
  },
  already_used: {
    title: "Invite friends - they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  no_referrals: {
    title: "Invite friends - they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  subscribed: {
    title: "Invite friends - they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
};

export function InviteReferralSection({ className = "" }: { className?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [inviteCopyState, setInviteCopyState] = useState<InviteCopyState>("no_referrals");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/referral/code", { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load"))
      ),
      fetch("/api/referral/discount-eligible", { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.resolve({ inviteCopyState: "no_referrals" as InviteCopyState })
      ),
    ])
      .then(([codeData, eligibleData]) => {
        if (mounted && codeData?.code) setCode(codeData.code);
        else if (mounted) setCode(null);
        if (mounted && isInviteCopyState(eligibleData?.inviteCopyState)) {
          setInviteCopyState(eligibleData.inviteCopyState);
        }
      })
      .catch(() => {
        if (mounted) setCode(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const link =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/register?ref=${encodeURIComponent(code)}`
      : "";

  const copyLink = useCallback(() => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [link]);

  const share = useCallback(() => {
    if (!link) return;
    const copy = INVITE_COPY[inviteCopyState];
    if (navigator.share) {
      navigator.share({
        title: "Try MenoLisa",
        text: copy.shareText,
        url: link,
      }).catch(() => copyLink());
    } else {
      copyLink();
    }
  }, [link, copyLink, inviteCopyState]);

  const copy =
    INVITE_COPY[inviteCopyState] ?? INVITE_COPY.no_referrals;

  return (
    <div className={className}>
      <div className="rounded-xl sm:rounded-2xl border border-border/30 bg-card backdrop-blur-lg p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div
            className="shrink-0 p-2.5 sm:p-3 rounded-xl shadow-md w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)" }}
          >
            <Gift className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0.5 sm:mb-1">
              {copy.title}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              {copy.subtitle}
            </p>
            {loading ? (
              <div className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
            ) : link ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted text-foreground px-3 py-2 text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Could not load your referral link. Please try again.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
