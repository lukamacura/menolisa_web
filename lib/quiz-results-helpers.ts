export interface QuizAnswers {
  symptoms: string[];
  severity: string;
  duration: string;
  name: string;
  triedBefore: string[];
  doctorStatus: string;
  goal: string;
}

export function getHeadline(name: string, severity: string): string {
  const displayName = name || "you";
  
  switch (severity) {
    case "severe":
      return `${displayName}, I hear you. And I'm so sorry it's been this hard.`;
    case "moderate":
      return `${displayName}, I understand. This isn't easy.`;
    case "mild":
      return `${displayName}, you're not imagining it. This is real.`;
    default:
      return `${displayName}, I'm here for you.`;
  }
}

export function getEmpathyMessage(answers: QuizAnswers): string {
  const { symptoms, severity, duration, name } = answers;
  const displayName = name || "you";
  const symptomCount = symptoms.length;

  // Severe + many symptoms + long time
  if (
    severity === "severe" &&
    symptomCount >= 4 &&
    ["over_year", "several_years"].includes(duration)
  ) {
    const durationText =
      duration === "several_years" ? "years" : "over a year";
    return `${symptomCount} symptoms. Every single day. For ${durationText}. ${displayName}, that's exhausting. You've been carrying so much — and probably feeling like no one really gets it. I do.`;
  }

  // Severe + any
  if (severity === "severe") {
    return `Struggling every day with ${symptomCount} different symptoms isn't something you should have to "push through." You deserve answers. You deserve relief. And ${displayName}, you deserve someone in your corner.`;
  }

  // Moderate + long time
  if (
    severity === "moderate" &&
    ["over_year", "several_years"].includes(duration)
  ) {
    const durationText =
      duration === "several_years" ? "years" : "over a year";
    return `${displayName}, dealing with this for ${durationText} while still showing up for work, family, life — that takes strength. But you shouldn't have to white-knuckle through this alone.`;
  }

  // Moderate
  if (severity === "moderate") {
    return `When symptoms start affecting your work and relationships, it's not "just menopause." It's your body asking for help. ${displayName}, I'm glad you're here.`;
  }

  // Mild + new
  if (severity === "mild" && duration === "just_started") {
    return `${displayName}, catching this early is smart. These symptoms might feel manageable now, but understanding your patterns now means you can stay ahead of them.`;
  }

  // Mild default
  return `${displayName}, even "mild" symptoms deserve attention. Your body is going through something real, and tracking it will help you understand what's actually going on.`;
}

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

export function getSymptomInsight(symptoms: string[]): Insight {
  // If they have sleep + brain fog
  if (
    symptoms.includes("sleep_issues") &&
    symptoms.includes("brain_fog")
  ) {
    return {
      icon: "Lightbulb",
      title: "There's a connection",
      text: "Poor sleep and brain fog often go hand-in-hand. When we fix one, the other usually improves too.",
    };
  }

  // If they have hot flashes + sleep
  if (
    symptoms.includes("hot_flashes") &&
    symptoms.includes("sleep_issues")
  ) {
    return {
      icon: "Lightbulb",
      title: "I see a pattern already",
      text: "Night sweats disrupting sleep is incredibly common. Tracking when they happen reveals what triggers them.",
    };
  }

  // If they have mood + fatigue
  if (
    symptoms.includes("mood_swings") &&
    symptoms.includes("low_energy")
  ) {
    return {
      icon: "Lightbulb",
      title: "This makes sense",
      text: "Exhaustion and mood swings feed each other. You're not being dramatic — you're depleted.",
    };
  }

  // If they have 5+ symptoms (but we only collect 2, so check for >= 2)
  if (symptoms.length >= 2) {
    return {
      icon: "Lightbulb",
      title: "It's all connected",
      text: `${symptoms.length} symptoms might feel overwhelming, but they often share root causes. Find one trigger, improve many symptoms.`,
    };
  }

  // Default
  return {
    icon: "Lightbulb",
    title: "You're not alone",
    text: "Millions of women experience exactly what you're going through. The difference is having someone help you understand it.",
  };
}

export function getJourneyInsight(
  triedBefore: string[],
  doctorStatus: string
): Insight {
  // Tried many things, nothing worked
  if (triedBefore.length >= 3) {
    return {
      icon: "Target",
      title: "You've been trying",
      text: "Supplements, diet, exercise — you're not giving up. What's been missing is understanding YOUR specific patterns and triggers.",
    };
  }

  // Talked to doctor but not helpful
  if (
    triedBefore.includes("doctor_talk") &&
    doctorStatus === "yes_not_helpful"
  ) {
    return {
      icon: "Target",
      title: "Feeling dismissed?",
      text: 'Too many doctors say "it\'s just menopause." Having your own data changes that conversation completely.',
    };
  }

  // Tried nothing yet
  if (triedBefore.includes("nothing") || triedBefore.length === 0) {
    return {
      icon: "Target",
      title: "Starting fresh",
      text: "Not knowing where to start is exactly why you're here. Lisa will guide you step by step.",
    };
  }

  // Default
  return {
    icon: "Target",
    title: "Now you have help",
    text: "Everything you've tried taught you something. Now Lisa helps you connect the dots.",
  };
}

export function getDoctorInsight(doctorStatus: string): Insight {
  switch (doctorStatus) {
    case "yes_actively":
      return {
        icon: "ClipboardList",
        title: "Better doctor visits",
        text: "Lisa creates reports you can share with your doctor — real data instead of trying to remember everything.",
      };

    case "yes_not_helpful":
      return {
        icon: "ClipboardList",
        title: "Get taken seriously",
        text: "Walking in with tracked data changes everything. Doctors respond differently when you have evidence.",
      };

    case "no_planning":
      return {
        icon: "ClipboardList",
        title: "Be prepared",
        text: "When you do see a doctor, you'll have weeks of data showing exactly what's happening. No more guessing.",
      };

    case "no_natural":
      return {
        icon: "ClipboardList",
        title: "Your body, your choice",
        text: "Understanding your triggers helps you manage symptoms naturally. Knowledge is power.",
      };

    default:
      return {
        icon: "ClipboardList",
        title: "Knowledge is power",
        text: "Whether you see a doctor or not, understanding your patterns puts you in control.",
      };
  }
}

export interface GoalPromise {
  title: string;
  text: string;
  icon: string;
}

export function getGoalPromise(goal: string, name: string): GoalPromise {
  const displayName = name || "you";

  const promises: Record<string, GoalPromise> = {
    sleep_through_night: {
      title: "Imagine sleeping through the night again",
      text: `${displayName}, within weeks of tracking, you'll know exactly what's disrupting your sleep — and what helps. No more guessing.`,
      icon: "Moon",
    },
    think_clearly: {
      title: "Your brain isn't broken",
      text: `${displayName}, brain fog has triggers. When you find yours, that sharp, clear-thinking you miss? She's still there.`,
      icon: "Brain",
    },
    feel_like_myself: {
      title: "She's still in there",
      text: `${displayName}, the you who laughed easily and felt at home in your body — she's not gone. We're going to find her.`,
      icon: "Heart",
    },
    understand_patterns: {
      title: "Clarity is coming",
      text: `${displayName}, within days you'll start seeing patterns. Within weeks, you'll understand your body in a way you never have.`,
      icon: "TrendingUp",
    },
    data_for_doctor: {
      title: "Walk in with confidence",
      text: `${displayName}, your next doctor visit will be different. You'll have real data, clear patterns, and specific questions.`,
      icon: "ClipboardList",
    },
    get_body_back: {
      title: "Your body is listening",
      text: `${displayName}, your body isn't betraying you — it's sending signals. When you understand them, you can finally respond.`,
      icon: "Sparkles",
    },
  };

  return promises[goal] || promises["understand_patterns"];
}

// Simplified helper functions for new results page

export function getSimplifiedHeadline(name: string): string {
  const displayName = name || "you";
  return `${displayName}, you're not alone.`;
}

export function getEmotionalStatement(
  severity: string,
  symptomCount: number,
  name: string
): string {
  const displayName = name || "you";

  if (severity === "severe") {
    return `${symptomCount} symptoms. Every single day. ${displayName}, you've been fighting this alone for too long.`;
  }

  if (severity === "moderate") {
    return `It's affecting your work. Your relationships. Your life. ${displayName}, this isn't something you should just "push through."`;
  }

  // mild
  return `What you're feeling is real. And ${displayName}, understanding it now means you can stay ahead of it.`;
}

export function getSymptomLabel(symptomCount: number): string {
  if (symptomCount >= 5) return "You're dealing with a lot:";
  if (symptomCount >= 3) return "Here's what you're facing:";
  return "Your symptoms:";
}

// Symptom ID to display label mapping
export const SYMPTOM_LABELS: Record<string, string> = {
  hot_flashes: "Hot flashes",
  sleep_issues: "Sleep issues",
  brain_fog: "Brain fog",
  mood_swings: "Mood swings",
  weight_changes: "Weight changes",
  low_energy: "Fatigue",
  anxiety: "Anxiety",
  joint_pain: "Joint pain",
};

