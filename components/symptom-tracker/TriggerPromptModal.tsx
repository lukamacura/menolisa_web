"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Symptom, SymptomLog } from "@/lib/symptom-tracker-constants";
import { getSuggestedTriggers, getRemainingTriggers } from "@/lib/triggerSuggestions";

interface TriggerPromptModalProps {
  symptom: Symptom;
  logId: string;
  allLogs: SymptomLog[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (triggers: string[]) => Promise<void>;
}

export default function TriggerPromptModal({
  symptom,
  logId,
  allLogs,
  isOpen,
  onClose,
  onSave,
}: TriggerPromptModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestedTriggers = useMemo(
    () => getSuggestedTriggers(symptom.name, symptom.id, allLogs, 4),
    [symptom.name, symptom.id, allLogs]
  );

  const commonTriggers = useMemo(() => {
    const remaining = getRemainingTriggers(suggestedTriggers, symptom.name);
    return remaining.slice(0, Math.max(0, 4 - suggestedTriggers.length));
  }, [suggestedTriggers, symptom.name]);

  const displayTriggers = [...suggestedTriggers, ...commonTriggers].slice(0, 4);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTriggers([]);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleTriggerClick = (trigger: string) => {
    setSelectedTriggers((prev) => {
      if (prev.includes(trigger)) {
        return prev.filter((t) => t !== trigger);
      } else {
        return [...prev, trigger];
      }
    });
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      await onSave(selectedTriggers);
      onClose();
    } catch (error) {
      console.error("Failed to save triggers:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleSkip();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
      onClick={handleBackdropClick}
    >
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        style={{ background: 'linear-gradient(to bottom, #DBEAFE, #FEF3C7, #FCE7F3)' }}
      />
      
      <div
        className="relative bg-card backdrop-blur-lg rounded-2xl w-full max-w-md mx-4 shadow-xl border border-border/30 cursor-default overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-border/30">
          <h2 className="text-xl font-semibold text-card-foreground">
            Want to add what triggered this?
          </h2>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
            type="button"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-muted-foreground mb-4 text-base">
            Quick-tap to add triggers for <strong>{symptom.name}</strong>
          </p>

          {/* Trigger chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {displayTriggers.map((trigger) => (
              <button
                key={trigger}
                type="button"
                onClick={() => handleTriggerClick(trigger)}
                className={`px-4 py-2 rounded-full text-base font-medium transition-all cursor-pointer
                  ${
                    selectedTriggers.includes(trigger)
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card/60 text-card-foreground hover:bg-card/80 border border-border/30"
                  }`}
              >
                {trigger}
                {selectedTriggers.includes(trigger) && " ✓"}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleSave}
              disabled={isSubmitting || selectedTriggers.length === 0}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground 
                       font-semibold py-3 rounded-xl transition-colors cursor-pointer
                       disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-lg"
            >
              {isSubmitting ? "Saving..." : `Add ${selectedTriggers.length > 0 ? `${selectedTriggers.length} trigger${selectedTriggers.length > 1 ? 's' : ''}` : 'triggers'}`}
            </button>

            <button
              onClick={handleSkip}
              className="w-full text-[#6B6B6B] hover:text-[#3D3D3D] 
                       font-medium py-2 rounded-xl transition-colors cursor-pointer text-sm"
              type="button"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
