/**
 * WHY Question Router
 * Detects hormone-related WHY questions and determines if routing to menopause persona is needed
 */

import type { Persona } from "../types";

/**
 * Detects if a query is asking a hormone-related WHY question
 * Uses deterministic keyword patterns
 */
export function isWhyHormoneQuestion(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check for WHY question patterns combined with hormone-related keywords
  const whyPatterns = [
    /\bwhy\b/,
    /\bcause\b/,
    /\bcaused by\b/,
    /\bwhat causes\b/,
    /\bwhat's causing\b/,
    /\bwhat is causing\b/,
    /\bhow come\b/,
  ];
  
  const hormoneKeywords = [
    "hormone",
    "estrogen",
    "progesterone",
    "perimenopause",
    "menopause causes",
    "because of hormones",
    "hormonal",
    "hormone-related",
    "due to hormones",
    "hormone changes",
    "hormone decline",
    "hormone imbalance",
  ];
  
  // Check if text contains a WHY pattern
  const hasWhyPattern = whyPatterns.some(pattern => pattern.test(lowerText));
  
  // Check if text contains hormone keywords
  const hasHormoneKeyword = hormoneKeywords.some(keyword => lowerText.includes(keyword));
  
  // Return true if both WHY pattern and hormone keyword are present
  return hasWhyPattern && hasHormoneKeyword;
}

/**
 * Determines if a query should be routed to menopause persona
 * Returns true if persona is exercise/nutrition AND question is hormone-related
 */
export function shouldRouteWhyToMenopause(persona: Persona, text: string): boolean {
  // Only route for exercise and nutrition personas
  if (persona !== "exercise_trainer" && persona !== "nutrition_coach") {
    return false;
  }
  
  // Check if it's a hormone-related WHY question
  return isWhyHormoneQuestion(text);
}

