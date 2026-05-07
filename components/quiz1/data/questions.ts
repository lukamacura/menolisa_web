export type Pillar =
  | "sleep"
  | "stress"
  | "nutrition"
  | "movement"
  | "supplements"
  | "hrt";

export type Option = {
  id: string;
  label: string;
  weak?: boolean;
};

export type Question = {
  pillar: Pillar;
  pillarLabel: string;
  prompt: string;
  options: Option[];
};

export const QUESTIONS: Question[] = [
  {
    pillar: "sleep",
    pillarLabel: "Sleep",
    prompt: "How would you describe your sleep right now?",
    options: [
      { id: "solid", label: "Solid 7–9 hours, consistent wake time" },
      { id: "hot_flashes", label: "Hot flashes are fragmenting my nights", weak: true },
      { id: "under_7", label: "Under 7 hours most nights", weak: true },
      { id: "alcohol", label: "Disrupted by alcohol or late meals", weak: true },
      { id: "irregular", label: "All over the place — schedule changes a lot", weak: true },
    ],
  },
  {
    pillar: "stress",
    pillarLabel: "Stress",
    prompt: "What do you currently lean on when stress hits?",
    options: [
      { id: "breathwork", label: "Breathwork or meditation" },
      { id: "cold", label: "Cold showers" },
      { id: "walks", label: "Long walks in nature" },
      { id: "social", label: "Calling a friend / social connection" },
      { id: "white_knuckling", label: "Honestly, I'm white-knuckling it right now", weak: true },
    ],
  },
  {
    pillar: "nutrition",
    pillarLabel: "Nutrition",
    prompt: "Which of these sounds most like how you eat?",
    options: [
      { id: "protein", label: "Protein first at every meal (around 30g)" },
      { id: "fiber", label: "Tracking fiber daily (25–35g from veg, legumes, oats)" },
      { id: "carbs_around_exercise", label: "Most of my carbs land around exercise" },
      { id: "low_sugar_alcohol", label: "I avoid liquid sugar and go light on alcohol" },
      { id: "tre", label: "I eat inside an 8–10 hour window" },
      { id: "unstructured", label: "None of these — my eating is pretty unstructured", weak: true },
    ],
  },
  {
    pillar: "movement",
    pillarLabel: "Movement",
    prompt: "Which type of movement fits into your week most often right now?",
    options: [
      { id: "strength", label: "Strength training, 2–3x/week" },
      { id: "hiit", label: "HIIT, even just 10 minutes, 2x/week" },
      { id: "walks_after_meals", label: "Walking after meals, 10–15 minutes" },
      { id: "yoga", label: "Yoga or resistance bands" },
      { id: "none", label: "Honestly, none of these consistently", weak: true },
    ],
  },
  {
    pillar: "supplements",
    pillarLabel: "Supplements",
    prompt: "Where are you with supplements right now?",
    options: [
      { id: "targeted", label: "I take a few targeted ones for meno (e.g. magnesium, omega-3, D3)" },
      { id: "multivitamin", label: "Just a multivitamin" },
      { id: "experimenting", label: "I'm experimenting / figuring it out" },
      { id: "nothing", label: "Nothing right now", weak: true },
    ],
  },
  {
    pillar: "hrt",
    pillarLabel: "HRT",
    prompt: "Where are you with HRT?",
    options: [
      { id: "transdermal", label: "On transdermal estradiol (patch or gel)" },
      { id: "oral", label: "On oral estrogen" },
      { id: "micronised_progesterone", label: "Using micronised progesterone" },
      { id: "synthetic_progestin", label: "Using synthetic progestins (MPA)" },
      { id: "considering", label: "Considering HRT, haven't started" },
      { id: "not_considering", label: "Not on HRT, and not considering right now", weak: true },
    ],
  },
];
