"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import HookScreen from "@/components/quiz1/HookScreen";
import QuestionScreen from "@/components/quiz1/QuestionScreen";
import LoadingScreen from "@/components/quiz1/LoadingScreen";
import ResultScreen from "@/components/quiz1/ResultScreen";
import { QUESTIONS, Pillar } from "@/components/quiz1/data/questions";
import {
  Quiz1State,
  loadState,
  saveState,
  pickWeakPillars,
  persistCompletion,
} from "@/components/quiz1/lib/state";
import { track } from "@/lib/analytics";

type Phase = "hook" | "question" | "loading" | "result";

const AUTO_ADVANCE_MS = 250;
const LOADING_MS = 1800;

export default function Quiz1Page() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("hook");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [state, setState] = useState<Quiz1State>({});
  const [hydrated, setHydrated] = useState(false);

  const startedAtRef = useRef<number | null>(null);
  const questionShownAtRef = useRef<number>(0);

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    const loaded = loadState();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loaded);
    setHydrated(true);
    track("quiz1_view_hook");
  }, []);

  const currentQuestion = QUESTIONS[questionIndex];
  const selectedForCurrent = currentQuestion ? state[currentQuestion.pillar] : undefined;

  const result = useMemo(() => {
    if (phase !== "result") return null;
    return pickWeakPillars(state);
  }, [phase, state]);

  const handleStart = useCallback(() => {
    startedAtRef.current = Date.now();
    questionShownAtRef.current = Date.now();
    track("quiz1_start");
    setQuestionIndex(0);
    setPhase("question");
  }, []);

  const advance = useCallback(
    (nextState: Quiz1State) => {
      if (questionIndex < QUESTIONS.length - 1) {
        setQuestionIndex((i) => i + 1);
        questionShownAtRef.current = Date.now();
        return;
      }
      // Finished the last question.
      const completed: Quiz1State = { ...nextState, completedAt: new Date().toISOString() };
      setState(completed);
      saveState(completed);
      persistCompletion(completed);
      const { weak } = pickWeakPillars(completed);
      track("quiz1_complete", {
        weakPillars: weak,
        totalDurationMs: startedAtRef.current ? Date.now() - startedAtRef.current : null,
      });
      setPhase("loading");
      setTimeout(() => setPhase("result"), LOADING_MS);
    },
    [questionIndex]
  );

  const handleSelect = useCallback(
    (optionId: string) => {
      const q = QUESTIONS[questionIndex];
      if (!q) return;
      const nextState: Quiz1State = { ...state, [q.pillar]: optionId };
      setState(nextState);
      saveState(nextState);
      track("quiz1_q_answered", {
        question: questionIndex + 1,
        pillar: q.pillar,
        optionId,
        msSinceQuestionShown: Date.now() - questionShownAtRef.current,
      });
      setTimeout(() => advance(nextState), AUTO_ADVANCE_MS);
    },
    [questionIndex, state, advance]
  );

  const handleBack = useCallback(() => {
    if (questionIndex === 0) {
      setPhase("hook");
      return;
    }
    track("quiz1_back", { fromQuestion: questionIndex + 1 });
    setQuestionIndex((i) => i - 1);
    questionShownAtRef.current = Date.now();
  }, [questionIndex]);

  const handleCta = useCallback(() => {
    const weak: Pillar[] = result?.weak ?? [];
    track("quiz1_cta_click", { weakPillars: weak });
    router.push("/register");
  }, [result, router]);

  if (!hydrated) {
    return (
      <div
        className="fixed inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 0%, #4A1B4F 0%, #2D0F33 55%, #1F0A24 100%)",
        }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-y-auto overflow-x-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 15% 0%, #4A1B4F 0%, #2D0F33 55%, #1F0A24 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -right-32 w-[380px] h-[380px] rounded-full blur-3xl opacity-15"
        style={{ background: "radial-gradient(circle, #E8A4B0 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-48 -left-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-10"
        style={{ background: "radial-gradient(circle, #E5B583 0%, transparent 70%)" }}
      />
      <div className="relative flex flex-col" style={{ minHeight: "100dvh" }}>
      <AnimatePresence mode="wait">
        {phase === "hook" && <HookScreen key="hook" onStart={handleStart} />}

        {phase === "question" && currentQuestion && (
          <QuestionScreen
            key={`q-${questionIndex}`}
            question={currentQuestion}
            index={questionIndex}
            total={QUESTIONS.length}
            selected={selectedForCurrent}
            canGoBack={true}
            onSelect={handleSelect}
            onBack={handleBack}
          />
        )}

        {phase === "loading" && <LoadingScreen key="loading" />}

        {phase === "result" && result && (
          <ResultScreen
            key="result"
            weak={result.weak}
            strong={result.strong}
            isAllStrong={result.isAllStrong}
            onCta={handleCta}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
