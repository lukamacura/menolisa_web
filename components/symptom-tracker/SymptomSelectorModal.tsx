"use client";

import { X } from "lucide-react";
import type { Symptom } from "@/lib/symptom-tracker-constants";
import { resolveSymptomLucideIcon } from "@/lib/symptomIconMapping";

interface SymptomSelectorModalProps {
  symptoms: Symptom[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symptom: Symptom) => void;
}

export default function SymptomSelectorModal({
  symptoms,
  isOpen,
  onClose,
  onSelect,
}: SymptomSelectorModalProps) {
  if (!isOpen) return null;

  // Filter out "Good Day" symptom - it's been replaced by daily mood tracking
  const filteredSymptoms = symptoms.filter((s) => s.name !== "Good Day");

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSymptomClick = (symptom: Symptom) => {
    onSelect(symptom);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 cursor-pointer"
      onClick={handleBackdropClick}
      style={{ background: 'linear-gradient(to bottom, #DBEAFE, #FEF3C7, #FCE7F3)' }}
    >
      <div
        className="bg-card backdrop-blur-lg rounded-2xl w-full max-w-3xl mx-4 p-4 sm:p-6 shadow-xl border border-border/30 cursor-default max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4 sm:mb-5">
          <h2 className="text-lg sm:text-xl font-semibold text-card-foreground">
            Select a Symptom
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer p-1"
            type="button"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Symptoms Grid */}
        {filteredSymptoms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No symptoms available</p>
            <p className="text-sm text-muted-foreground/70 mt-2">
              Default symptoms will be created when you first log in.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredSymptoms.map((symptom) => {
              const SymptomIcon = resolveSymptomLucideIcon(symptom);

              return (
                <button
                  key={symptom.id}
                  onClick={() => handleSymptomClick(symptom)}
                  className="bg-card/40 backdrop-blur-md rounded-xl p-3 
                             flex flex-col items-center justify-center gap-2
                             border border-border/30 transition-all
                             hover:bg-card/60 hover:-translate-y-0.5 hover:shadow-lg
                             active:scale-95 cursor-pointer text-center min-h-[90px]"
                >
                  <SymptomIcon className="h-5 w-5 text-card-foreground shrink-0" />
                  <span className="text-card-foreground font-medium text-xs leading-tight line-clamp-2 wrap-break-word w-full">
                    {symptom.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

