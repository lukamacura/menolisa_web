"use client";

import { useState, useEffect, useCallback } from "react";
import { Gift, Copy, Share2 } from "lucide-react";

type InviteCopyState = "eligible" | "already_used" | "already_subscribed" | "no_referrals";

const INVITE_COPY_KEYS: InviteCopyState[] = [
  "eligible",
  "already_used",
  "already_subscribed",
  "no_referrals",
];

function isInviteCopyState(s: unknown): s is InviteCopyState {
  return typeof s === "string" && INVITE_COPY_KEYS.includes(s as InviteCopyState);
}

const INVITE_COPY: Record<
  InviteCopyState,
  { title: string; subtitle: string; shareText: string }
> = {
  eligible: {
    title: "Give 3 days free. Get 50% off.",
    subtitle:
      "Invite friends to try MenoLisa. They get 3 days free; you get 50% off your first subscription when you upgrade.",
    shareText: "Give 3 days free. Get 50% off. Invite friends to try MenoLisa.",
  },
  already_used: {
    title: "Invite friends - they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  already_subscribed: {
    title: "Invite friends - they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  no_referrals: {
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
      <div className="rounded-2xl  bg-orange-200 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl shrink-0 bg-orange-300 w-14 h-14 flex items-center justify-center">
            <Gift className="h-7 w-7 text-orange-800 " />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground mb-1">
              {copy.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {copy.subtitle}
            </p>
            {loading ? (
              <div className="h-9 w-24 rounded-lg bg-amber-200/50 dark:bg-amber-800/30 animate-pulse" />
            ) : link ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-orange-300 text-orange-800! px-3 py-2 text-sm font-medium  dark:text-amber-200 hover:bg-orange-400  transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-2 rounded-lg border  bg-amber-800 text-orange-200 px-3 py-2 text-sm font-medium hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors"
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
