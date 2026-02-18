/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Type definitions for Persona-Based RAG Orchestration
 */

export type Persona = 
  | "menopause_specialist" 
  | "nutrition_coach" 
  | "exercise_trainer" 
  | "empathy_companion";

export type RetrievalMode = "kb_strict" | "hybrid" | "llm_reasoning";

export type QueryValidation = "allowed" | "refused" | "kb_required";

export interface ContentSections {
  has_content: boolean;
  has_action_tips: boolean;
  has_motivation: boolean;
  has_followup: boolean;
  has_habit_strategy: boolean;
}

export interface FollowUpLink {
  persona: string;
  topic: string;
  subtopic: string;
  label: string; // User-friendly text describing what they'll learn
}

export interface KBEntry {
  id: string;
  content: string;  // Already formatted, readable text from DB
  metadata: {
    persona: string;
    topic: string;
    subtopic: string;
    keywords: string[];
    intent_patterns: string[];
    content_sections: ContentSections;
    follow_up_links?: FollowUpLink[]; // Cross-reference related content
    source?: string;
    section_index?: number;
  };
  similarity?: number; // Final hybrid score (for ranking)
  semanticSimilarity?: number; // Raw semantic similarity from vector search (for threshold gating)
}

export interface RetrievalResult {
  kbEntries: KBEntry[];
  hasMatch: boolean;
  topScore?: number; // Final hybrid score
  topSemanticScore?: number; // Top semantic similarity score (for threshold gating)
}

export interface OrchestrationResult {
  response?: string; // Only set for verbatim responses or refusal responses
  persona: Persona;
  retrievalMode: RetrievalMode;
  usedKB: boolean;
  source: "kb" | "llm"; // Source of response
  kbEntries?: KBEntry[];
  isVerbatim?: boolean; // True if response is verbatim KB content (no LLM)
  kbContext?: string; // KB context for hybrid mode (to be passed to LLM)
}

export interface SafetyResult {
  allowed: boolean;
  refused: boolean;
  reason?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  persona?: Persona;
  timestamp: number;
}

export interface ConversationMemory {
  sessionId: string;
  messages: ConversationMessage[];
  userPreferences?: Record<string, any>;
}






