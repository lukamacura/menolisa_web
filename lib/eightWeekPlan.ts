import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSequenceEmail } from "@/lib/resend";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

interface PlanWeek {
  week: number;
  title: string;
  focus: string;
  actions: string[];
}

interface PlanProfile {
  name: string | null;
  top_problems: string[] | null;
  timing: string | null;
  goal: string | null;
  goals: string[] | null;
  hrt_status: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Deterministic fallback so the promised plan is always delivered, even if the LLM call fails. */
function fallbackWeeks(): PlanWeek[] {
  const themes: Array<[string, string, string[]]> = [
    ["Get your baseline", "Just log how you feel each day.", ["Log at least one symptom daily", "Note your sleep and mood", "Say hi to Lisa and tell her what's hardest right now"]],
    ["Spot the triggers", "Start connecting symptoms to what came before them.", ["Log triggers when a symptom flares", "Track your evening routine", "Ask Lisa what patterns she's seeing"]],
    ["Steady your sleep", "Small shifts to protect the night.", ["Keep a consistent wind-down time", "Log nights after caffeine or alcohol", "Review your sleep pattern with Lisa"]],
    ["Fuel the day", "Eat in a way that softens the swings.", ["Log meals before symptom flares", "Add protein to breakfast", "Ask Lisa about foods for your top symptom"]],
    ["Move gently", "Build energy without burning out.", ["Add a 10-minute daily walk", "Log how movement affects your mood", "Try one strength session"]],
    ["Calm the system", "Lower the background stress that fuels symptoms.", ["Try 5 minutes of slow breathing daily", "Log your most stressful moments", "Ask Lisa for a calming routine"]],
    ["See the pattern", "Look back at six weeks of data.", ["Review your trends with Lisa", "Notice what's improved", "Pick the one change that helped most"]],
    ["Lock it in", "Turn what worked into a routine that lasts.", ["Build your doctor summary in Lisa", "Set your keep-going habits", "Plan the next 8 weeks"]],
  ];
  return themes.map(([title, focus, actions], i) => ({ week: i + 1, title, focus, actions }));
}

async function generatePlanWeeks(profile: PlanProfile): Promise<PlanWeek[]> {
  const problems = profile.top_problems?.length ? profile.top_problems.join(", ") : "general menopause symptoms";
  const goals = profile.goals?.length ? profile.goals.join(", ") : profile.goal ?? "feeling more in control";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Lisa, a warm, evidence-informed menopause health companion. " +
            "Build a personalized 8-week plan. Return JSON only: " +
            '{"weeks":[{"week":1,"title":"...","focus":"...","actions":["...","...","..."]}, ... 8 weeks]}. ' +
            "Each week: a short title (max 5 words), a one-sentence focus, and 2-4 concrete, gentle, doable actions. " +
            "Weeks should build progressively (baseline → triggers → sleep/nutrition/movement → stress → review → sustain). " +
            "Tie advice to the user's specific symptoms and goals. Encouraging, never clinical or alarming. No medical claims or dosages.",
        },
        {
          role: "user",
          content:
            `Top symptoms: ${problems}\n` +
            `Goals: ${goals}\n` +
            `Menopause stage: ${profile.timing ?? "unknown"}\n` +
            `HRT status: ${profile.hrt_status ?? "unknown"}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallbackWeeks();
    const parsed = JSON.parse(raw) as { weeks?: PlanWeek[] };
    const weeks = parsed.weeks;
    if (!Array.isArray(weeks) || weeks.length < 4) return fallbackWeeks();
    return weeks.slice(0, 8).map((w, i) => ({
      week: i + 1,
      title: String(w.title ?? `Week ${i + 1}`),
      focus: String(w.focus ?? ""),
      actions: Array.isArray(w.actions) ? w.actions.map(String).slice(0, 4) : [],
    }));
  } catch (err) {
    console.error("8-week plan: LLM generation failed, using fallback:", err);
    return fallbackWeeks();
  }
}

// Paper-note palette. Solid hex only — email clients drop rgba/8-digit hex unpredictably.
const NOTE_COLORS = [
  { tape: "#ff8fb3", paper: "#fff0f5", ink: "#c1366b", tab: "#ff6b9d", soft: "#ffe3ec" }, // pink
  { tape: "#ffd83d", paper: "#fffbe8", ink: "#a87b00", tab: "#f2c200", soft: "#fff3c4" }, // yellow
  { tape: "#7ba6ff", paper: "#eef3ff", ink: "#2f5fd0", tab: "#5b8def", soft: "#dde8ff" }, // blue
];

// The 8 weeks fall into four natural phases. Used to group the plan with
// section headers so the email reads as a journey, not a flat list.
const PHASES: Array<{ label: string; weeks: [number, number] }> = [
  { label: "Phase 1 · Understand", weeks: [1, 2] },
  { label: "Phase 2 · Stabilize", weeks: [3, 4] },
  { label: "Phase 3 · Strengthen", weeks: [5, 6] },
  { label: "Phase 4 · Sustain", weeks: [7, 8] },
];

// Handwritten ("Caveat") + readable serif ("Georgia"). Clients that strip the
// webfont fall back to a cursive system face, then Georgia for body.
const HAND = "'Caveat','Bradley Hand','Comic Sans MS',cursive";
const BODY = "Georgia,'Times New Roman',serif";

function renderWeekCard(w: PlanWeek): string {
  const c = NOTE_COLORS[(w.week - 1) % NOTE_COLORS.length];

  const actions = w.actions.length
    ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px">${w.actions
        .map(
          (a) => `<tr>
          <td valign="top" style="width:30px;padding:6px 0;font-family:${HAND};font-size:24px;line-height:1.2;color:${c.ink}">✓</td>
          <td style="padding:6px 0;font-family:${BODY};font-size:16px;line-height:1.65;color:#3a352f">${escapeHtml(a)}</td>
        </tr>`
        )
        .join("")}</table>`
    : "";

  return `
<tr><td style="padding:0 0 30px">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <!-- washi tape -->
    <tr><td align="center" style="font-size:0;line-height:0;padding-bottom:0">
      <div style="display:inline-block;width:140px;height:24px;background-color:${c.tape};border-radius:4px"></div>
    </td></tr>
    <!-- note card -->
    <tr><td style="background-color:${c.paper};border:1px solid ${c.tape};border-top:none;border-radius:0 0 16px 16px;padding:24px 28px 26px">

      <!-- card head: number + title -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td valign="top" style="width:62px">
          <div style="width:52px;height:52px;background-color:${c.tab};border-radius:50%;text-align:center;font-family:${HAND};font-size:30px;font-weight:700;color:#ffffff;line-height:52px">${w.week}</div>
        </td>
        <td valign="middle">
          <div style="font-family:${HAND};font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:${c.ink}">Week ${w.week}</div>
          <div style="font-family:${HAND};font-size:32px;line-height:1.1;color:#2d2a26">${escapeHtml(w.title)}</div>
        </td>
      </tr></table>

      ${
        w.focus
          ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px"><tr>
              <td style="width:4px;background-color:${c.tab};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
              <td style="padding:2px 0 2px 14px;font-family:${BODY};font-size:16px;line-height:1.6;color:#5b524a;font-style:italic">${escapeHtml(w.focus)}</td>
            </tr></table>`
          : ""
      }

      ${
        actions
          ? `<div style="margin-top:20px;font-family:${HAND};font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:${c.ink}">This week</div>
             <div style="height:1px;background-color:${c.tape};margin-top:6px;font-size:0;line-height:0">&nbsp;</div>
             ${actions}`
          : ""
      }

    </td></tr>
  </table>
</td></tr>`;
}

function renderPhaseHeader(label: string): string {
  return `
<tr><td style="padding:6px 0 22px">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="width:50%;border-bottom:1px solid #e3d9c6;font-size:0;line-height:0">&nbsp;</td>
    <td style="padding:0 14px;white-space:nowrap;font-family:${HAND};font-size:18px;letter-spacing:.04em;text-transform:uppercase;color:#a89878">${escapeHtml(label)}</td>
    <td style="width:50%;border-bottom:1px solid #e3d9c6;font-size:0;line-height:0">&nbsp;</td>
  </tr></table>
</td></tr>`;
}

function renderPlanHtml(name: string | null, weeks: PlanWeek[]): string {
  const greeting = name?.trim() || "there";

  // Group week cards under phase headers.
  const weekBlocks = PHASES.map((phase) => {
    const inPhase = weeks.filter((w) => w.week >= phase.weeks[0] && w.week <= phase.weeks[1]);
    if (!inPhase.length) return "";
    return renderPhaseHeader(phase.label) + inPhase.map(renderWeekCard).join("");
  }).join("");

  // "How this works" intro chips.
  const howItWorks = [
    ["🗓️", "One focus a week", "Eight weeks, eight gentle shifts — never all at once."],
    ["✅", "Small daily actions", "A few doable steps each week that build on the last."],
    ["💬", "Lisa adapts with you", "Log as you go and I'll fine-tune the plan to your patterns."],
  ]
    .map(
      ([icon, title, body]) => `
      <tr>
        <td valign="top" style="width:40px;padding:0 0 16px;font-size:24px;line-height:1.2">${icon}</td>
        <td style="padding:0 0 16px">
          <div style="font-family:${BODY};font-size:16px;font-weight:700;color:#2d2a26;line-height:1.3">${title}</div>
          <div style="font-family:${BODY};font-size:15px;line-height:1.6;color:#6b6155;margin-top:3px">${body}</div>
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your 8-week plan</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap" rel="stylesheet">
  <style>@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');</style>
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#efe7d8">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#efe7d8" style="background-color:#efe7d8">
  <tr><td align="center" style="padding:40px 14px 56px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">

      <!-- Paper sheet -->
      <tr><td style="background-color:#fffdf7;border-radius:18px;border:1px solid #ece3d1;padding:0">

        <!-- top color band -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td height="10" style="background-color:#ff6b9d;font-size:0;line-height:0;border-radius:18px 0 0 0">&nbsp;</td>
          <td height="10" style="background-color:#ffd83d;font-size:0;line-height:0">&nbsp;</td>
          <td height="10" style="background-color:#5b8def;font-size:0;line-height:0;border-radius:0 18px 0 0">&nbsp;</td>
        </tr></table>

        <!-- header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:40px 36px 4px">
          <div style="font-family:${HAND};font-size:22px;color:#ff6b9d">a little something from Lisa</div>
          <div style="font-family:${HAND};font-size:52px;line-height:1.04;color:#2d2a26;margin-top:4px">Your 8-week plan</div>
          <div style="height:4px;width:84px;background-color:#ffd83d;margin-top:12px;border-radius:3px"></div>

          <p style="margin:26px 0 14px;font-family:${BODY};font-size:17px;line-height:1.75;color:#3a352f">Hi ${escapeHtml(greeting)},</p>
          <p style="margin:0 0 14px;font-family:${BODY};font-size:17px;line-height:1.75;color:#3a352f">I built this from your answers — eight weeks, one small focus at a time, shaped around what you told me matters most.</p>
          <p style="margin:0;font-family:${BODY};font-size:17px;line-height:1.75;color:#3a352f">No rushing. Just follow the week you're in, and I'll adjust as we learn your patterns together.</p>
        </td></tr></table>

        <!-- how this works -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 36px 0">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f1e4;border-radius:14px">
            <tr><td style="padding:24px 26px 8px">
              <div style="font-family:${HAND};font-size:24px;color:#2d2a26;margin-bottom:14px">How this works</div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">${howItWorks}</table>
            </td></tr>
          </table>
        </td></tr></table>

        <!-- weeks -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:34px 36px 8px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">${weekBlocks}</table>
        </td></tr></table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 36px 40px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef6ee;border:1px solid #f3e7d6;border-radius:16px">
            <tr><td align="center" style="padding:30px 28px">
              <div style="font-family:${HAND};font-size:30px;line-height:1.15;color:#2d2a26;margin-bottom:6px">Ready when you are</div>
              <p style="margin:0 0 20px;font-family:${BODY};font-size:16px;line-height:1.6;color:#6b6155">Open your tracker and take the first small step of Week 1.</p>
              <table cellpadding="0" cellspacing="0" border="0" align="center"><tr>
                <td bgcolor="#5b8def" style="background-color:#5b8def;border-radius:40px">
                  <a href="${APP_URL}/dashboard/symptoms" target="_blank" style="display:inline-block;padding:16px 44px;font-family:${HAND};font-size:24px;font-weight:700;color:#ffffff;text-decoration:none">Start Week 1 →</a>
                </td>
              </tr></table>
              <p style="margin:20px 0 0;font-family:${HAND};font-size:20px;color:#c1366b">You've got this. — Lisa 💛</p>
            </td></tr>
          </table>
        </td></tr></table>

      </td></tr>

      <!-- footer -->
      <tr><td style="padding:24px 28px 0;text-align:center">
        <p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.6;color:#9b9183">This plan is a starting point, not medical advice. Always talk to your doctor about treatment decisions.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Generates a personalized 8-week plan with the LLM and emails it.
 * Self-contained: fetches the user's profile by id. Safe to run from `after()` —
 * never throws; logs and falls back so the webhook is unaffected.
 */
export async function send8WeekPlanEmail(to: string, userId: string): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("name, top_problems, timing, goal, goals, hrt_status")
      .eq("user_id", userId)
      .maybeSingle();

    const weeks = await generatePlanWeeks((profile ?? {}) as PlanProfile);
    const html = renderPlanHtml(profile?.name ?? null, weeks);
    const { error } = await sendSequenceEmail(to, "Your personalized 8-week plan is ready", html);
    if (error) console.error("8-week plan: send failed:", error);
  } catch (err) {
    console.error("8-week plan: send8WeekPlanEmail failed:", err);
  }
}
