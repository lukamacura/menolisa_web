"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import OtpForm from "@/components/auth/OtpForm";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | null): string {
  if (!value) return "/dashboard/symptoms";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard/symptoms";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const message = searchParams.get("message");
  const successMsg = !errorParam && message ? message : null;

  return (
    <main className="relative overflow-hidden mx-auto max-w-md p-6 sm:p-8 min-h-screen flex flex-col justify-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-40">
        <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex justify-center mb-6">
          <Image
            src="/quiz/illustration_email.png"
            alt="Email illustration"
            width={120}
            height={120}
          />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-balance">
            Welcome back
          </h1>
          <p className="text-lg text-muted-foreground">
            We&apos;ll email you a code to sign in. No password needed.
          </p>
        </div>

        {successMsg && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-green-400/30 bg-green-50/80 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-400 flex items-start gap-3"
          >
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{successMsg}</p>
          </div>
        )}

        <OtpForm
          mode="login"
          onSuccess={() => {
            const next = safeNextPath(searchParams.get("redirectedFrom"));
            router.push(next);
            router.refresh();
          }}
        />

        <p className="mt-6 text-md text-muted-foreground text-center">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary font-semibold underline-offset-4 hover:opacity-80">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage({
  params: _params,
  searchParams: _searchParams,
}: {
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  return (
    <Suspense fallback={
      <main className="relative mx-auto max-w-md p-6 sm:p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
