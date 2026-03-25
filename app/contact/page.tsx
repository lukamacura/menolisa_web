"use client"

import { useState } from "react"
import Link from "next/link"

const SUPPORT_EMAIL = "menolisahelp@gmail.com"

export default function ContactPage() {
  const [copied, setCopied] = useState(false)

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable (e.g. some browsers without permission)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6 sm:p-8">
      <p className="mb-6 pt-18">
        <Link href="/" prefetch={false} className="text-primary hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-3xl font-bold mb-4">Contact</h1>
      <p className="text-muted-foreground mb-6">
        Questions about MenoLisa or help with your account? Send us an email—we&apos;ll reply as soon as we can.
      </p>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-primary hover:underline break-all"
        >
          {SUPPORT_EMAIL}
        </a>
        <button
          type="button"
          onClick={() => void copyEmail()}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {copied ? "Copied" : "Copy email"}
        </button>
      </div>
    </div>
  )
}
