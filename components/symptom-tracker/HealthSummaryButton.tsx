"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { formatHealthSummaryReport } from "@/lib/formatHealthSummaryReport";

export default function HealthSummaryButton() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateSummary = async () => {
    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch("/api/health-summary?days=30");
      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const { report } = await response.json();
      const reportText = formatHealthSummaryReport(report);

      // Create and download file
      const blob = new Blob([reportText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-summary-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleGenerateSummary}
        disabled={isGenerating}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card/40 hover:bg-card/60 backdrop-blur-md text-foreground font-medium rounded-lg transition-colors border border-border/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <FileText className="h-3.5 w-3.5 animate-pulse" />
            Generating...
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            Get Summary
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-primary">{error}</p>
      )}
    </div>
  );
}

