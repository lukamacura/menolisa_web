import { Pillar, QUESTIONS } from "../data/questions";

export type Quiz1State = {
  sleep?: string;
  stress?: string;
  nutrition?: string;
  movement?: string;
  supplements?: string;
  hrt?: string;
  completedAt?: string;
};

export const STATE_KEY = "quiz1_state";
export const COMPLETED_KEY = "quiz1_completed";
export const PROFILE_KEY = "quiz1_profile";

const PILLAR_LABEL: Record<Pillar, string> = {
  sleep: "Sleep",
  stress: "Stress",
  nutrition: "Nutrition",
  movement: "Movement",
  supplements: "Supplements",
  hrt: "HRT",
};

// Priority order for tie-breaking when picking weak pillars (highest leverage first).
const WEAK_PRIORITY: Pillar[] = [
  "sleep",
  "stress",
  "nutrition",
  "movement",
  "supplements",
  "hrt",
];

export function loadState(): Quiz1State {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Quiz1State;
  } catch {
    return {};
  }
}

export function saveState(state: Quiz1State) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function isWeak(pillar: Pillar, optionId: string): boolean {
  const q = QUESTIONS.find((x) => x.pillar === pillar);
  return q?.options.find((o) => o.id === optionId)?.weak === true;
}

export function pickWeakPillars(state: Quiz1State): {
  weak: Pillar[];
  strong: Pillar[];
  isAllStrong: boolean;
} {
  const allPillars: Pillar[] = ["sleep", "stress", "nutrition", "movement", "supplements", "hrt"];

  const weak: Pillar[] = [];
  const strong: Pillar[] = [];

  for (const p of allPillars) {
    const answer = state[p];
    if (!answer) continue;
    if (isWeak(p, answer)) weak.push(p);
    else strong.push(p);
  }

  const sorted = (arr: Pillar[]) =>
    [...arr].sort((a, b) => WEAK_PRIORITY.indexOf(a) - WEAK_PRIORITY.indexOf(b));

  const sortedWeak = sorted(weak);
  const sortedStrong = sorted(strong);

  if (sortedWeak.length >= 2) {
    return { weak: sortedWeak.slice(0, 2), strong: sortedStrong, isAllStrong: false };
  }

  if (sortedWeak.length === 1) {
    // Pad with the lowest-priority strong pillar (i.e. the one with the least signal).
    const pad = sortedStrong[sortedStrong.length - 1];
    return {
      weak: pad ? [sortedWeak[0], pad] : sortedWeak,
      strong: sortedStrong,
      isAllStrong: false,
    };
  }

  // All strong — fallback per spec: Movement + Stress.
  return {
    weak: ["movement", "stress"],
    strong: sortedStrong,
    isAllStrong: true,
  };
}

export function pillarLabel(p: Pillar): string {
  return PILLAR_LABEL[p];
}

export type Quiz1Profile = {
  top_problems: string[];
  tried_options: string[];
  name: null;
  severity: null;
  timing: null;
  goal: null;
  doctor_status: null;
};

export function buildProfile(state: Quiz1State): Quiz1Profile {
  const topProblems = new Set<string>();
  const triedOptions = new Set<string>(["apps"]);

  if (state.sleep === "hot_flashes") {
    topProblems.add("hot_flashes");
    topProblems.add("sleep_issues");
  }
  if (
    state.sleep === "under_7" ||
    state.sleep === "alcohol" ||
    state.sleep === "irregular"
  ) {
    topProblems.add("sleep_issues");
  }

  if (state.stress === "white_knuckling") {
    topProblems.add("anxiety");
  }

  if (state.supplements && state.supplements !== "nothing") {
    triedOptions.add("supplements");
  }

  if (
    state.hrt === "transdermal" ||
    state.hrt === "oral" ||
    state.hrt === "micronised_progesterone" ||
    state.hrt === "synthetic_progestin"
  ) {
    triedOptions.add("hrt");
  }

  return {
    top_problems: Array.from(topProblems),
    tried_options: Array.from(triedOptions),
    name: null,
    severity: null,
    timing: null,
    goal: null,
    doctor_status: null,
  };
}

export function persistCompletion(state: Quiz1State) {
  if (typeof sessionStorage === "undefined") return;
  saveState(state);
  sessionStorage.setItem(COMPLETED_KEY, "true");
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(buildProfile(state)));
}
