"use client";

import { useState, useEffect, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { SEVERITY_LABELS } from "@/lib/symptom-tracker-constants";
import type { LogSymptomData, Symptom, SymptomLog } from "@/lib/symptom-tracker-constants";
import { getSuggestedTriggers, getRemainingTriggers } from "@/lib/triggerSuggestions";
import { getIconFromName } from "@/lib/symptomIconMapping";
import { motion, AnimatePresence } from "framer-motion";

interface LogSymptomModalProps {
  symptom: Symptom;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LogSymptomData) => Promise<void>;
  editingLog?: SymptomLog | null; // Optional: if provided, we're editing
  allLogs?: SymptomLog[]; // Optional: all logs for trigger suggestions
}

type Step = 1 | 2 | 3 | 4;

export default function LogSymptomModal({
  symptom,
  isOpen,
  onClose,
  onSave,
  editingLog = null,
  allLogs = [],
}: LogSymptomModalProps) {
  const isGoodDay = symptom.name === "Good Day";
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [severity, setSeverity] = useState(isGoodDay ? 1 : 2); // Good Day defaults to Mild (green), others to Moderate
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [timeSelection, setTimeSelection] = useState<'now' | 'earlier-today' | 'yesterday'>('now');
  const [customTime, setCustomTime] = useState<string>(""); // For time picker when "earlier today" or "yesterday" is selected
  const [customTrigger, setCustomTrigger] = useState<string>("");
  const [showCustomTriggerInput, setShowCustomTriggerInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editingLog;

  // Get icon component - always map by symptom name for consistency
  const SymptomIcon = useMemo(() => {
    // Map symptom names to icon names (prioritize name mapping for unique icons)
    const iconMap: Record<string, string> = {
      'Hot flashes': 'Flame',
      'Night sweats': 'Droplet',
      'Fatigue': 'Zap',
      'Brain fog': 'Brain',
      'Mood swings': 'Heart',
      'Anxiety': 'AlertCircle',
      'Headaches': 'AlertTriangle',
      'Joint pain': 'Activity',
      'Bloating': 'CircleDot',
      'Insomnia': 'Moon',
      'Weight gain': 'TrendingUp',
      'Low libido': 'HeartOff',
      'Good Day': 'Sun',
    };
    
    // Try to get icon by symptom name first (ensures unique icons)
    const iconName = iconMap[symptom.name];
    if (iconName) {
      return getIconFromName(iconName);
    }
    
    // Fallback: try to use icon from database if it's a valid icon name
    if (symptom.icon && symptom.icon.length > 1 && !symptom.icon.includes('🔥') && !symptom.icon.includes('💧')) {
      return getIconFromName(symptom.icon);
    }
    
    // Default fallback
    return getIconFromName('Activity');
  }, [symptom.icon, symptom.name]);

  // Get suggested triggers for this symptom
  const suggestedTriggers = useMemo(() => {
    if (isEditing || allLogs.length === 0) return [];
    return getSuggestedTriggers(symptom.id, allLogs, 3);
  }, [symptom.id, allLogs, isEditing]);

  // Get remaining triggers (not in suggested list)
  const remainingTriggers = useMemo(() => {
    return getRemainingTriggers(suggestedTriggers);
  }, [suggestedTriggers]);

  // Reset form when modal opens/closes or editing log changes
  useEffect(() => {
    if (isOpen) {
      if (editingLog) {
        // Pre-populate form with existing log data
        setSeverity(editingLog.severity);
        setSelectedTriggers(editingLog.triggers || []);
        setNotes(editingLog.notes || "");
        setTimeSelection('now'); // When editing, don't change the time
        setCurrentStep(1); // Start at step 1
      } else {
        // Reset to defaults for new log
        setSeverity(isGoodDay ? 1 : 2); // Good Day defaults to Mild (green), others to Moderate
        setSelectedTriggers([]);
        setNotes("");
        setTimeSelection('now');
        setCustomTime("");
        setCustomTrigger("");
        setShowCustomTriggerInput(false);
        setCurrentStep(1); // Start at step 1 (severity since symptom is pre-selected)
      }
      setError(null);
    }
  }, [isOpen, editingLog]);

  if (!isOpen) return null;

  // CRITICAL: Toggle trigger without closing modal
  const handleTriggerClick = (trigger: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop bubbling - THIS FIXES THE BUG

    setSelectedTriggers((prev) => {
      if (prev.includes(trigger)) {
        return prev.filter((t) => t !== trigger);
      } else {
        return [...prev, trigger];
      }
    });
  };

  // Handle backdrop click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Calculate logged_at timestamp based on time selection
  const getLoggedAtTimestamp = (): string | undefined => {
    if (isEditing) {
      // When editing, don't change the timestamp
      return undefined;
    }

    const now = new Date();
    
    if (timeSelection === 'now') {
      return undefined; // API will use current time
    }
    
    if (timeSelection === 'earlier-today') {
      if (customTime) {
        // Parse custom time (format: HH:MM)
        const [hours, minutes] = customTime.split(':').map(Number);
        const logTime = new Date(now);
        logTime.setHours(hours, minutes, 0, 0);
        return logTime.toISOString();
      }
      // Default to 2 hours ago if no custom time
      const logTime = new Date(now);
      logTime.setHours(logTime.getHours() - 2);
      return logTime.toISOString();
    }
    
    if (timeSelection === 'yesterday') {
      const logTime = new Date(now);
      logTime.setDate(logTime.getDate() - 1);
      if (customTime) {
        const [hours, minutes] = customTime.split(':').map(Number);
        logTime.setHours(hours, minutes, 0, 0);
      } else {
        // Default to same time yesterday
        logTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
      }
      return logTime.toISOString();
    }
    
    return undefined;
  };

  // Handle save
  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const loggedAt = getLoggedAtTimestamp();

      await onSave({
        symptomId: symptom.id,
        severity,
        triggers: selectedTriggers,
        notes,
        logId: editingLog?.id, // Include log ID if editing
        loggedAt, // Include timestamp if specified
      });

      // Reset form
      setSeverity(isGoodDay ? 1 : 2); // Good Day defaults to Mild (green), others to Moderate
      setSelectedTriggers([]);
      setNotes("");
      setTimeSelection('now');
      setCustomTime("");
      setCurrentStep(1);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save symptom log");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as Step);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  // Step validation
  const canProceed = () => {
    switch (currentStep) {
      case 1: // Severity - always has a default value
        return true;
      case 2: // Triggers - optional, can always proceed
        return true;
      case 3: // Time - optional, can always proceed
        return true;
      case 4: // Notes - optional, can always proceed
        return true;
      default:
        return false;
    }
  };

  // When editing, skip time step (step 3)
  const totalSteps = isEditing ? 3 : 4;
  const steps = isEditing 
    ? [
        { number: 1, title: "Severity" },
        { number: 2, title: "Triggers" },
        { number: 3, title: "Notes" },
      ]
    : [
        { number: 1, title: "Severity" },
        { number: 2, title: "Triggers" },
        { number: 3, title: "When" },
        { number: 4, title: "Notes" },
      ];

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 cursor-pointer"
      onClick={handleBackdropClick}
      style={{ background: 'linear-gradient(to bottom, #DBEAFE, #FEF3C7, #FCE7F3)' }}
    >
      {/* Modal - Full screen on mobile, centered on desktop */}
      <div
        className="bg-card backdrop-blur-lg rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg mx-auto shadow-xl border border-border/30 cursor-default overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-3">
            <SymptomIcon className="h-7 w-7 sm:h-6 sm:w-6 text-card-foreground" />
            <h2 className="text-xl sm:text-xl font-bold text-card-foreground">
              {isEditing ? "Update" : "Log"} {symptom.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            type="button"
            aria-label="Close modal"
          >
            <X className="h-7 w-7 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-border/30 shrink-0">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-base sm:text-sm transition-all
                    ${
                      currentStep === step.number
                        ? "bg-primary text-primary-foreground shadow-lg scale-110"
                        : currentStep > step.number
                        ? "bg-green-500 text-white"
                        : "bg-card/60 text-muted-foreground border-2 border-border/30"
                    }`}
                >
                  {currentStep > step.number ? <Check className="h-5 w-5 sm:h-4 sm:w-4" /> : step.number}
                </div>
                <span className="text-xs sm:text-xs mt-1 text-muted-foreground font-medium">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-1 sm:h-0.5 flex-1 mx-1 sm:mx-2 transition-all rounded-full
                    ${currentStep > step.number ? "bg-green-500" : "bg-border/30"}
                  `}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6 min-h-[300px] sm:min-h-[400px]">
            <AnimatePresence mode="wait">
              {/* Step 1: Severity */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-card/40 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-border/30">
                    <label className="text-card-foreground text-xl sm:text-lg mb-5 sm:mb-4 block font-bold">
                      How bad is it?
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-3 sm:justify-center">
                    {[1, 2, 3].map((level) => {
                      const severityInfo = SEVERITY_LABELS[level as keyof typeof SEVERITY_LABELS];
                      const SeverityIconComponent = severityInfo.icon;
                      const isSelected = severity === level;
                      const borderColor = level === 1 
                        ? 'border-green-500' 
                        : level === 2 
                        ? 'border-yellow-500' 
                        : 'border-red-500';
                      const bgColor = level === 1 
                        ? 'bg-green-50/50' 
                        : level === 2 
                        ? 'bg-yellow-50/50' 
                        : 'bg-red-50/50';
                      const iconColor = level === 1 
                        ? 'text-green-600' 
                        : level === 2 
                        ? 'text-yellow-600' 
                        : 'text-red-600';
                      
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSeverity(level);
                          }}
                          className={`flex flex-col sm:flex-col items-center gap-3 sm:gap-2 px-6 sm:px-5 py-5 sm:py-4 rounded-2xl sm:rounded-xl transition-all cursor-pointer border-2 min-h-[80px] sm:min-h-0
                            ${
                              isSelected
                                ? `${borderColor} ${bgColor} scale-[1.02] shadow-md`
                                : "border-border/30 bg-card/60 hover:bg-card/80 hover:border-border/40 active:scale-95"
                            }`}
                        >
                          <SeverityIconComponent className={`h-9 w-9 sm:h-7 sm:w-7 ${iconColor}`} />
                          <span className={`font-bold text-lg sm:text-sm ${isSelected ? 'text-card-foreground' : 'text-muted-foreground'}`}>
                            {severityInfo.label}
                          </span>
                          <span className={`text-sm sm:text-xs text-center ${isSelected ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                            {severityInfo.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

              {/* Step 2: Triggers */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-card/40 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-border/30">
                    <label className="text-card-foreground text-xl sm:text-lg mb-5 sm:mb-4 block font-bold">
                      Any idea what triggered it? (optional)
                    </label>
                  
                    {/* Suggested Triggers */}
                    {suggestedTriggers.length > 0 && !isEditing && (
                      <div className="mb-4">
                        <p className="text-base sm:text-sm text-muted-foreground mb-3 sm:mb-2 font-medium">
                          Suggested (based on your patterns):
                        </p>
                        <div className="flex flex-wrap gap-2.5 sm:gap-2">
                          {suggestedTriggers.map((trigger) => (
                            <button
                              key={trigger}
                              type="button"
                              onClick={(e) => handleTriggerClick(trigger, e)}
                              className={`px-5 py-3 sm:px-4 sm:py-2 rounded-full text-lg sm:text-base font-medium transition-all cursor-pointer min-h-[48px] sm:min-h-0
                                ${
                                  selectedTriggers.includes(trigger)
                                    ? "bg-[#ff74b1] text-white shadow-md active:scale-95"
                                    : "bg-card/60 text-card-foreground hover:bg-card/80 border-2 border-border/30 active:scale-95"
                                }`}
                            >
                              {trigger}
                              {selectedTriggers.includes(trigger) && " ✓"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other Triggers */}
                    {remainingTriggers.length > 0 && (
                      <div>
                        <p className="text-base sm:text-sm text-muted-foreground mb-3 sm:mb-2 font-medium">
                          Other:
                        </p>
                        <div className="flex flex-wrap gap-2.5 sm:gap-2">
                          {remainingTriggers.map((trigger) => (
                            <button
                              key={trigger}
                              type="button"
                              onClick={(e) => handleTriggerClick(trigger, e)}
                              className={`px-5 py-3 sm:px-4 sm:py-2 rounded-full text-lg sm:text-base transition-all cursor-pointer min-h-[48px] sm:min-h-0
                                ${
                                  selectedTriggers.includes(trigger)
                                    ? "bg-[#ff74b1] text-white shadow-md active:scale-95"
                                    : "bg-card/60 text-card-foreground hover:bg-card/80 border-2 border-border/30 active:scale-95"
                                }`}
                            >
                              {trigger}
                              {selectedTriggers.includes(trigger) && " ✓"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Trigger */}
                    <div className="mt-5 sm:mt-4">
                      {!showCustomTriggerInput ? (
                        <button
                          type="button"
                          onClick={() => setShowCustomTriggerInput(true)}
                          className="px-5 py-3 sm:px-4 sm:py-2 rounded-full text-lg sm:text-base text-primary hover:text-primary/90 hover:bg-card/60 transition-colors cursor-pointer border-2 border-primary/50 bg-card/40 font-medium min-h-[48px] sm:min-h-0"
                        >
                          + Custom
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customTrigger}
                            onChange={(e) => setCustomTrigger(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customTrigger.trim()) {
                                e.preventDefault();
                                if (!selectedTriggers.includes(customTrigger.trim())) {
                                  setSelectedTriggers([...selectedTriggers, customTrigger.trim()]);
                                }
                                setCustomTrigger("");
                                setShowCustomTriggerInput(false);
                              }
                            }}
                            placeholder="Enter custom trigger"
                            className="flex-1 px-5 py-3 sm:px-4 sm:py-2 rounded-xl border-2 border-border/30 text-lg sm:text-base bg-card/60 backdrop-blur-md
                                     focus:outline-none focus:ring-2 focus:ring-[#ff74b1] min-h-[48px] sm:min-h-0"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (customTrigger.trim() && !selectedTriggers.includes(customTrigger.trim())) {
                                setSelectedTriggers([...selectedTriggers, customTrigger.trim()]);
                              }
                              setCustomTrigger("");
                              setShowCustomTriggerInput(false);
                            }}
                            className="px-5 py-3 sm:px-4 sm:py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors cursor-pointer text-lg sm:text-base font-medium min-h-[48px] sm:min-h-0"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Time Selection (skip when editing) */}
              {currentStep === 3 && !isEditing && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-card/40 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-border/30">
                    <label className="text-card-foreground text-xl sm:text-lg mb-5 sm:mb-4 block font-bold">
                      When did this happen?
                    </label>
                    <div className="flex flex-col gap-3 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTimeSelection('now');
                          setCustomTime("");
                        }}
                        className={`px-5 py-4 sm:px-4 sm:py-3 rounded-xl text-left transition-all cursor-pointer text-lg sm:text-base font-medium min-h-[56px] sm:min-h-0
                          ${
                            timeSelection === 'now'
                              ? "bg-[#ff74b1] text-white shadow-md active:scale-95"
                              : "bg-white/60 text-[#3D3D3D] hover:bg-white/80 border-2 border-white/30 active:scale-95"
                          }`}
                      >
                        Just now {timeSelection === 'now' && '✓'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeSelection('earlier-today')}
                        className={`px-5 py-4 sm:px-4 sm:py-3 rounded-xl text-left transition-all cursor-pointer text-lg sm:text-base font-medium min-h-[56px] sm:min-h-0
                          ${
                            timeSelection === 'earlier-today'
                              ? "bg-[#ff74b1] text-white shadow-md active:scale-95"
                              : "bg-white/60 text-[#3D3D3D] hover:bg-white/80 border-2 border-white/30 active:scale-95"
                          }`}
                      >
                        Earlier today {timeSelection === 'earlier-today' && '✓'}
                      </button>
                      {timeSelection === 'earlier-today' && (
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-4 px-5 py-3 sm:px-4 sm:py-2 rounded-xl border-2 border-white/30 text-lg sm:text-base bg-white/60 backdrop-blur-md
                                   focus:outline-none focus:ring-2 focus:ring-[#ff74b1] min-h-[48px] sm:min-h-0"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setTimeSelection('yesterday')}
                        className={`px-5 py-4 sm:px-4 sm:py-3 rounded-xl text-left transition-all cursor-pointer text-lg sm:text-base font-medium min-h-[56px] sm:min-h-0
                          ${
                            timeSelection === 'yesterday'
                              ? "bg-[#ff74b1] text-white shadow-md active:scale-95"
                              : "bg-white/60 text-[#3D3D3D] hover:bg-white/80 border-2 border-white/30 active:scale-95"
                          }`}
                      >
                        Yesterday {timeSelection === 'yesterday' && '✓'}
                      </button>
                      {timeSelection === 'yesterday' && (
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-4 px-5 py-3 sm:px-4 sm:py-2 rounded-xl border-2 border-white/30 text-lg sm:text-base bg-white/60 backdrop-blur-md
                                   focus:outline-none focus:ring-2 focus:ring-[#ff74b1] min-h-[48px] sm:min-h-0"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Notes (or Step 3 when editing) */}
              {((currentStep === 4 && !isEditing) || (currentStep === 3 && isEditing)) && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-card/40 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-border/30">
                    <label className="text-card-foreground text-xl sm:text-lg mb-5 sm:mb-4 block font-bold">
                      Quick note (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Was in a meeting when it hit..."
                      className="w-full bg-card/60 backdrop-blur-md text-card-foreground rounded-xl p-4 sm:p-4 text-lg sm:text-base 
                               placeholder-muted-foreground resize-none h-40 sm:h-32
                               focus:outline-none focus:ring-2 focus:ring-primary border-2 border-border/30"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 sm:px-6 pb-3 sm:pb-4 shrink-0">
            <div className="rounded-lg border-2 border-primary/30 bg-primary/10 p-4 sm:p-3 text-base sm:text-sm text-primary font-medium">
              {error}
            </div>
          </div>
        )}

        {/* Navigation & Submit */}
        <div className="px-4 sm:px-6 py-4 sm:py-4 border-t border-white/30 flex justify-between items-center gap-3 sm:gap-4 shrink-0 bg-card/50">
          <button
            onClick={currentStep === 1 ? onClose : handlePrevious}
            className="flex items-center justify-center gap-2 px-5 py-3 sm:px-4 sm:py-2 text-[#6B6B6B] hover:text-[#3D3D3D] transition-colors cursor-pointer
                     bg-white/40 backdrop-blur-md rounded-xl border-2 border-white/30 hover:bg-white/60 text-lg sm:text-base font-medium min-h-[52px] sm:min-h-0 active:scale-95"
            type="button"
          >
            <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
            {currentStep === 1 ? "Cancel" : "Back"}
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center justify-center gap-2 px-6 py-3 sm:px-6 sm:py-2 bg-[#ff74b1] hover:bg-primary-dark text-white 
                       font-bold rounded-xl transition-colors cursor-pointer shadow-lg text-lg sm:text-base min-h-[52px] sm:min-h-0 active:scale-95
                       disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              Next
              <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-6 py-3 sm:px-6 sm:py-2 bg-[#ff74b1] hover:bg-primary-dark text-white 
                       font-bold rounded-xl transition-colors cursor-pointer shadow-lg text-lg sm:text-base min-h-[52px] sm:min-h-0 active:scale-95
                       disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isSubmitting 
                ? (isEditing ? "Updating..." : "Logging...") 
                : (isEditing ? "Update Symptom" : "Log Symptom")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
