"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTrialStatus, type TrialStatus } from "@/lib/useTrialStatus";

export type DashboardTrialValue = TrialStatus & { refetch: () => Promise<void> };

const DashboardTrialContext = createContext<DashboardTrialValue | null>(null);

/**
 * Single source of trial/subscription state for the dashboard tree.
 * Avoids duplicate useTrialStatus() (and duplicate Stripe sync for paid users) on every page.
 */
export function DashboardTrialProvider({ children }: { children: ReactNode }) {
  const trial = useTrialStatus();
  return (
    <DashboardTrialContext.Provider value={trial}>{children}</DashboardTrialContext.Provider>
  );
}

export function useDashboardTrialStatus(): DashboardTrialValue {
  const ctx = useContext(DashboardTrialContext);
  if (!ctx) {
    throw new Error("useDashboardTrialStatus must be used within DashboardTrialProvider");
  }
  return ctx;
}
