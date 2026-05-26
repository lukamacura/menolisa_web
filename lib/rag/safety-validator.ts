/**
 * Safety Validator - Validates queries for Menopause Specialist persona
 * Implements refusal logic for medication/dosage queries
 * Mode-aware: only refuses in llm_reasoning mode without KB answer
 */

import type { SafetyResult } from "./types";

/**
 * List of refused medication names (case-insensitive matching)
 */
const REFUSED_MEDICATIONS = [
  "premarin", "estrace", "provera", "prometrium", "climara", "vivelle",
  "estradiol", "estrogen", "progesterone", "testosterone", "dhea",
  "prempak", "prempro", "premphase", "activella", "angeliq", "climara pro",
  "combipatch", "duavee", "prefest", "premphase", "prempro", "prempak"
];

/**
 * Patterns that indicate dosage questions (refused)
 */
const DOSAGE_PATTERNS = [
  /how much.*should i take/i,
  /what.*dosage/i,
  /what.*dose/i,
  /how many.*mg/i,
  /how many.*mcg/i,
  /how many.*units/i,
  /prescription.*dosage/i,
  /recommended.*dosage/i,
  /how much.*per day/i,
  /how much.*daily/i,
  /dosing.*schedule/i,
  /how to take.*mg/i,
];

/**
 * Patterns that indicate general HRT/menopause education (allowed)
 */
const ALLOWED_PATTERNS = [
  /what is hrt/i,
  /what is hormone replacement/i,
  /how does hrt work/i,
  /explain.*hrt/i,
  /tell me about.*hrt/i,
  /what are.*hormones/i,
  /how do.*hormones.*work/i,
  /menopause.*symptoms/i,
  /what causes.*symptoms/i,
  /why.*symptoms/i,
  /menopause.*phases/i,
  /perimenopause/i,
  /postmenopause/i,
];

/**
 * Validate a query for medication/dosage safety.
 *
 * Policy: vetted KB content is trusted, so if the KB has an answer we always allow.
 * Otherwise, prescription-medication / dosage / prescription-advice questions are
 * REFUSED in every mode — we never let the free-form LLM invent dosing or prescribing
 * advice. (Previously this only refused in llm_reasoning mode, which meant the
 * menopause_specialist persona — always kb_strict — never refused and fell through to
 * the temp-0.7 LLM.)
 *
 * @param query - User query to validate
 * @param hasKBAnswer - Whether KB has an answer for this query
 * @returns SafetyResult with allowed/refused status and reason
 */
export function validateMenopauseQuery(
  query: string,
  hasKBAnswer: boolean
): SafetyResult {
  const lowerQuery = query.toLowerCase();

  // Always allow general HRT/menopause education questions
  if (ALLOWED_PATTERNS.some(pattern => pattern.test(query))) {
    return {
      allowed: true,
      refused: false,
    };
  }

  const isDosageQuestion = DOSAGE_PATTERNS.some(pattern => pattern.test(query));
  const mentionsMedication = REFUSED_MEDICATIONS.some(med => lowerQuery.includes(med));
  const isPrescriptionAdvice = /(prescription|prescribe|doctor.*prescribe|should.*prescribe)/i.test(query);

  // Allow general supplement dosage (calcium, vitamin D, magnesium) — these are not
  // prescription medications and are safe to discuss in general terms.
  if (isDosageQuestion && !mentionsMedication && !isPrescriptionAdvice) {
    const generalSupplements = ["calcium", "vitamin d", "vitamin", "magnesium", "supplement"];
    if (generalSupplements.some(supp => lowerQuery.includes(supp))) {
      return {
        allowed: true,
        refused: false,
      };
    }
  }

  // Prescription medication / dosage / prescription-advice questions:
  // trust the KB if it has a vetted answer, otherwise REFUSE in every mode.
  if (isDosageQuestion || mentionsMedication || isPrescriptionAdvice) {
    if (hasKBAnswer) {
      return {
        allowed: true,
        refused: false,
      };
    }
    return {
      allowed: false,
      refused: true,
      reason: generateRefusalResponse(query),
    };
  }

  // Default: allow (will be handled by KB or LLM with safety boundaries)
  return {
    allowed: true,
    refused: false,
  };
}

/**
 * Generate a polite refusal response for refused queries
 */
export function generateRefusalResponse(query: string): string {
  return `I understand you're looking for information about medications or dosages. I'm not able to provide specific medication recommendations or dosage advice, as these need to be determined by your healthcare provider based on your individual health profile.

For questions about:
- **Specific medications** (like Premarin, Estrace, etc.) → Please consult your doctor or pharmacist
- **Dosage questions** → Your healthcare provider will determine the right dosage for you
- **Prescription advice** → This requires a medical evaluation

I can help you with:
- General information about HRT and how it works
- Understanding menopause symptoms and phases
- Lifestyle strategies to support your menopause journey
- Questions about your symptoms and experiences

Would you like to explore any of these topics instead? 💜`;
}







