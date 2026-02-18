"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { TrialState } from "@/components/TrialCard";

interface PricingModalContextType {
  isOpen: boolean;
  openModal: (trialState?: TrialState, timeRemaining?: string, symptomCount?: number, patternCount?: number, userName?: string) => void;
  closeModal: () => void;
  trialState: TrialState;
  timeRemaining?: string;
  symptomCount: number;
  patternCount: number;
  userName?: string;
}

const PricingModalContext = createContext<PricingModalContextType | undefined>(undefined);

export function usePricingModal() {
  const context = useContext(PricingModalContext);
  if (!context) {
    throw new Error("usePricingModal must be used within PricingModalProvider");
  }
  return context;
}

export function PricingModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [trialState, setTrialState] = useState<TrialState>("calm");
  const [timeRemaining, setTimeRemaining] = useState<string | undefined>(undefined);
  const [symptomCount, setSymptomCount] = useState(0);
  const [patternCount, setPatternCount] = useState(0);
  const [userName, setUserName] = useState<string | undefined>(undefined);

  const openModal = (
    newTrialState: TrialState = "calm",
    newTimeRemaining?: string,
    newSymptomCount = 0,
    newPatternCount = 0,
    newUserName?: string
  ) => {
    setTrialState(newTrialState);
    setTimeRemaining(newTimeRemaining);
    setSymptomCount(newSymptomCount);
    setPatternCount(newPatternCount);
    setUserName(newUserName);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  return (
    <PricingModalContext.Provider
      value={{
        isOpen,
        openModal,
        closeModal,
        trialState,
        timeRemaining,
        symptomCount,
        patternCount,
        userName,
      }}
    >
      {children}
    </PricingModalContext.Provider>
  );
}
