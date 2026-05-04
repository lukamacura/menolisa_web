"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ArrowRight, Trash2 } from "lucide-react";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data?.error ?? "Failed to delete account. Please try again.");
        return;
      }
      setDeleteDialogOpen(false);
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      setDeleteError("Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 pb-24 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Settings
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
          Preferences and privacy controls.
        </p>
      </div>

      <section className="space-y-3 sm:space-y-4" aria-label="Preferences">
        <Link
          href="/dashboard/settings/notifications"
          className="group relative overflow-hidden block rounded-xl sm:rounded-2xl border border-border/30 bg-card backdrop-blur-lg p-4 sm:p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div
                className="shrink-0 p-2.5 sm:p-3 rounded-xl shadow-md"
                style={{ background: "linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)" }}
              >
                <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0.5 sm:mb-1 truncate">
                  Notification preferences
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                  Choose which reminders and weekly insights you receive
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      </section>

      <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-border/50">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 sm:mb-4">
          Privacy
        </h2>
        <div className="rounded-xl sm:rounded-2xl border bg-red-200 border-red-200/60 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 sm:gap-4 sm:flex-1 min-w-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-1">Delete account</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Permanently delete your account and all associated data. This cannot be undone.{" "}
                  <Link
                    href="/delete-account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Learn more
                  </Link>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
              className="w-full flex items-center gap-2 sm:w-auto sm:shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-red-800 bg-red-300 hover:bg-red-400 transition-colors border border-red-200 dark:border-red-800/50 touch-manipulation"
            >
              <Trash2 className="h-5 w-5 text-red-800" />
              Delete account
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete account"
        message="This will permanently delete your account and all your data (symptoms, mood, conversations, profile, and preferences). This action cannot be undone."
        confirmLabel="Delete account"
        loadingLabel="Deleting account..."
        isLoading={isDeleting}
        error={deleteError}
      />
    </div>
  );
}
