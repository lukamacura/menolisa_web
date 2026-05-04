import Link from "next/link";
import type { Metadata } from "next";
import { LogIn } from "lucide-react";

export const metadata: Metadata = {
  title: "Delete Your Account | MenoLisa",
  description:
    "How to delete your MenoLisa account and what data we remove. Steps for web and app. Macura Solutions LLC.",
};

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8 pb-16">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 pt-8 sm:pt-12">
          Delete Your Account
        </h1>
        <p className="text-muted-foreground mb-8">
          <strong>MenoLisa</strong>
          <br />
          Macura Solutions LLC
          <br />
          Last Updated: March 10, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4">
            How to delete your account
          </h2>
          <p className="mb-4">
            You may delete your MenoLisa account at any time. To do so:
          </p>
          <ol className="list-decimal pl-6 space-y-2 mb-4">
            <li>
              <strong>Sign in</strong> to your account (on the MenoLisa website
              or in the MenoLisa app).
            </li>
            <li>
              Go to <strong>Settings</strong> (in the app: open the menu and
              tap Settings; on the web: open the dashboard and go to Settings).
            </li>
            <li>
              Scroll to the <strong>Delete account</strong> section.
            </li>
            <li>
              Tap or click <strong>Delete account</strong>, then confirm in the
              dialog. Your account and associated data will be permanently
              removed.
            </li>
          </ol>
          <p>
            If you prefer, you may also request account deletion by contacting
            us at{" "}
            <a
              href="mailto:support@macurasolutions.us"
              className="text-primary hover:underline"
            >
              support@macurasolutions.us
            </a>
            .
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4">
            What data we delete
          </h2>
          <p className="mb-4">
            When you delete your account, we delete your personal and health
            data from our systems, including:
          </p>
          <ul className="list-disc pl-6 space-y-1 mb-4">
            <li>Symptom logs (type, severity, triggers, notes)</li>
            <li>Daily mood data</li>
            <li>Conversations with Lisa (chat history)</li>
            <li>Profile information (name, age, preferences)</li>
            <li>Account and notification preferences</li>
            <li>Push notification tokens</li>
            <li>Onboarding and quiz responses</li>
            <li>Referral and trial data associated with your account</li>
          </ul>
          <p>
            We also remove your authentication account so you cannot sign in
            again with the same credentials.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4">
            Data retention after deletion
          </h2>
          <p>
            Deletion is typically completed promptly. Some data may remain in
            backups for a limited period before being overwritten, or as required
            by law. We do not use deleted account data for any purpose once the
            deletion process has been completed.
          </p>
        </section>

        <section className="mb-8 rounded-xl border border-border/50 bg-card p-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            Ready to delete your account?
          </h2>
          <p className="text-muted-foreground mb-4">
            Sign in, then go to Account to delete your account and all
            associated data.
          </p>
          <Link
            href="/login?redirectedFrom=/dashboard/account"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-card! hover:opacity-90 transition-opacity"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            Log in and go to Account
          </Link>
        </section>

        <p className="text-sm text-muted-foreground">
          For more about how we collect, use, and protect your data, see our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms and Conditions
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
