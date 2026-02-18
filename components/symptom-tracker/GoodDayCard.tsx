"use client";

import { useState } from "react";
import { Sun } from "lucide-react";
import type { Symptom } from "@/lib/symptom-tracker-constants";
import QuickLogModal from "./QuickLogModal";

interface GoodDayCardProps {
  goodDaySymptom: Symptom | null;
  onSave: (data: { symptomId: string; severity: number; triggers: string[]; notes: string }) => Promise<void>;
}

export default function GoodDayCard({ goodDaySymptom, onSave }: GoodDayCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Create a temporary symptom object if it doesn't exist yet (will be created by API on first log)
  const symptomForModal = goodDaySymptom || {
    id: 'temp-good-day',
    user_id: '',
    name: 'Good Day',
    icon: 'Sun',
    is_default: false,
    created_at: new Date().toISOString(),
  };

  const handleSave = async (data: { symptomId: string; severity: number; triggers: string[]; notes: string }) => {
    await onSave(data);
    setIsModalOpen(false);
  };

  return (
    <>
      {/* Good Day Card */}
      <div className="group relative overflow-hidden rounded-2xl border-2 border-green-200/60 bg-linear-to-br from-green-50/80 via-emerald-50/60 to-green-100/80 backdrop-blur-md p-8 text-center shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-green-300/80 hover:scale-[1.02]">
        {/* Decorative linear overlay */}
        <div className="absolute inset-0 bg-linear-to-br from-green-400/5 via-transparent to-emerald-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Icon */}
        <div className="relative mb-4 flex justify-center">
          <div className="rounded-full bg-linear-to-br from-green-400 to-emerald-500 p-4 shadow-lg shadow-green-200/50">
            <Sun className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Content */}
        <div className="relative">
          <p className="text-[#2D5016] font-semibold text-xl mb-4">
            Feeling okay today?
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="relative px-8 py-3.5 bg-linear-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 cursor-pointer text-base shadow-md shadow-green-200/50 hover:shadow-lg hover:shadow-green-300/50 hover:-translate-y-0.5 active:translate-y-0"
            type="button"
          >
            Log a good day
          </button>
        </div>

        {/* Subtle accent dots */}
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-green-400/40 opacity-60" />
        <div className="absolute bottom-6 left-6 w-1.5 h-1.5 rounded-full bg-emerald-400/40 opacity-50" />
      </div>

      {/* Quick Log Modal - same as regular symptoms */}
      <QuickLogModal
        symptom={symptomForModal}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}

