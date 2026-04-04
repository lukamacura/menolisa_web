/**
 * RAG Orchestrator - Main orchestration logic for persona-based RAG
 */

import type { Persona, RetrievalMode, OrchestrationResult, FollowUpLink, KBEntry, ContentSections } from "./types";
import { classifyPersona } from "./persona-classifier";
import { validateMenopauseQuery, generateRefusalResponse } from "./safety-validator";
import { retrieveFromKB, retrieveFromKBByIntentOnly, normalizeTextForIntentMatching, checkExactIntentMatchAcrossAllPersonas, hasPerfectIntentMatch } from "./retrieval";
import { formatVerbatimResponse, formatKBContextForLLM } from "./response-formatter";
import { getConversationHistory } from "./conversation-memory";
import { shouldRouteWhyToMenopause, isWhyHormoneQuestion } from "./classifier/whyRouter";
import { rewriteQueryWithContext } from "./query-rewriter";
import { verifyKBRelevance } from "./relevance-gate";
import type { RetrievalResult } from "./types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Note: LLM calls are handled in the route to support tools (log_symptom, etc.)
// The orchestrator only handles KB retrieval and persona classification

// Type for Supabase document metadata
interface SupabaseDocumentMetadata {
  persona?: string;
  topic?: string;
  subtopic?: string;
  keywords?: string[];
  intent_patterns?: string[];
  content_sections?: Partial<ContentSections>;
  follow_up_links?: FollowUpLink[];
  source?: string;
  section_index?: number;
  id?: string;
}



/**
 * Check if retrieval result has exact (or equivalent) intent match.
 * Equivalent = same normalization pipeline as hybrid retrieval: high overlap with any
 * intent pattern (hasPerfectIntentMatch). That bypasses the LLM relevance gate, which
 * only sees topic/subtopic titles and can wrongly reject good rows (e.g. "metabolism
 * overview" title vs "why am I suddenly gaining weight?" queries).
 */
function findExactIntentMatch(retrievalResult: RetrievalResult, query: string): { entry: import("./types").KBEntry; intentScore: number } | null {
  if (!retrievalResult.hasMatch || retrievalResult.kbEntries.length === 0) {
    return null;
  }
  
  // Use consistent normalization from retrieval.ts
  const queryNormalized = normalizeTextForIntentMatching(query);
  
  // 1) Normalized string equality against any pattern
  for (const entry of retrievalResult.kbEntries) {
    const intentPatterns = entry.metadata.intent_patterns || [];
    
    for (const pattern of intentPatterns) {
      const patternNormalized = normalizeTextForIntentMatching(pattern);
      
      // Exact match after normalization
      if (queryNormalized === patternNormalized) {
        console.log(`[Exact Intent Match] ✅ Found exact match: "${query}" === "${pattern}"`);
        console.log(`[Exact Intent Match] Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
        return { entry, intentScore: 1.0 };
      }
    }
  }

  // 2) Strong intent overlap (synonyms + phrase normalization) — same bar as "perfect" in retrieval
  for (const entry of retrievalResult.kbEntries) {
    const intentPatterns = entry.metadata.intent_patterns || [];
    if (intentPatterns.length > 0 && hasPerfectIntentMatch(intentPatterns, query)) {
      console.log(
        `[Exact Intent Match] ✅ Perfect intent overlap (verbatim, skip relevance gate) | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`,
      );
      return { entry, intentScore: 1.0 };
    }
  }
  
  return null;
}

/**
 * Determine retrieval mode based on persona
 */
function getRetrievalMode(persona: Persona): RetrievalMode {
  switch (persona) {
    case "menopause_specialist":
      return "kb_strict";
    case "nutrition_coach":
    case "exercise_trainer":
      return "hybrid";
    case "empathy_companion":
      return "llm_reasoning";
    default:
      return "kb_strict"; // Default fallback
  }
}





/**
 * Retrieve KB entry by exact metadata match
 * FIX: Direct database query instead of semantic search to avoid wrong chunk
 * Uses exact topic & subtopic matching to guarantee correct chunk retrieval
 */
async function retrieveKBEntryByMetadata(
  persona: string,
  topic: string,
  subtopic: string
): Promise<KBEntry | null> {
  try {
    const supabaseClient = getSupabaseAdmin();
    
    // Map persona if needed (menopause_specialist -> menopause)
    // Follow-up links should already have correct persona, but handle both cases
    const metadataPersona = persona === "menopause_specialist" ? "menopause" : persona;
    
    // Direct database query by exact metadata match using JSONB containment
    // This bypasses semantic search to ensure we get the exact chunk
    const { data: matches, error } = await supabaseClient
      .from('documents')
      .select('id, content, metadata')
      .contains('metadata', { persona: metadataPersona, topic, subtopic });
    
    if (error) {
      console.error(`[Follow-up Link] Error querying KB entry: ${error.message}`);
      console.log(`[Follow-up Link] Falling back to semantic search for: ${metadataPersona} > ${topic} > ${subtopic}`);
      
      // Fallback to semantic search if direct query fails
      const retrievalResult = await retrieveFromKB(
        `${topic} ${subtopic}`,
        persona as Persona,
        10, // Get more results
        0.7
      );
      
      // Find exact match in results
      for (const entry of retrievalResult.kbEntries) {
        const entryPersona = entry.metadata.persona === "menopause_specialist" ? "menopause" : entry.metadata.persona;
        if (
          entryPersona === metadataPersona &&
          entry.metadata.topic === topic &&
          entry.metadata.subtopic === subtopic
        ) {
          console.log(`[Follow-up Link] Found match via fallback semantic search`);
          return entry;
        }
      }
      return null;
    }
    
    if (!matches || matches.length === 0) {
      console.log(`[Follow-up Link] ⚠️ No KB entry found for: ${metadataPersona} > ${topic} > ${subtopic}`);
      return null;
    }
    
    // CRITICAL FIX: Filter to exact matches only
    // JSONB contains() might return partial matches, so we need explicit exact string matching
    const exactMatches = matches.filter(m => {
      const meta = m.metadata as SupabaseDocumentMetadata;
      const exactPersonaMatch = meta.persona === metadataPersona;
      const exactTopicMatch = meta.topic === topic;
      const exactSubtopicMatch = meta.subtopic === subtopic;
      
      return exactPersonaMatch && exactTopicMatch && exactSubtopicMatch;
    });
    
    if (exactMatches.length === 0) {
      console.log(`[Follow-up Link] ⚠️ No EXACT match found for: ${metadataPersona} > ${topic} > ${subtopic}`);
      console.log(`[Follow-up Link] Found ${matches.length} potential match(es), but none matched exactly:`);
      // Log what was found for debugging
      matches.slice(0, 5).forEach((m, idx) => {
        const meta = m.metadata as SupabaseDocumentMetadata;
        const personaMatch = meta.persona === metadataPersona ? '✓' : '✗';
        const topicMatch = meta.topic === topic ? '✓' : '✗';
        const subtopicMatch = meta.subtopic === subtopic ? '✓' : '✗';
        console.log(`  [${idx + 1}] Persona: ${personaMatch} Topic: ${topicMatch} Subtopic: ${subtopicMatch}`);
        console.log(`      Found: "${meta.persona}" > "${meta.topic}" > "${meta.subtopic}"`);
      });
      return null;
    }
    
    // If multiple exact matches exist (should be rare - only if section was split), prefer section_index: 0
    if (exactMatches.length > 1) {
      console.log(`[Follow-up Link] Multiple exact matches found (${exactMatches.length}) for: ${metadataPersona} > ${topic} > ${subtopic}`);
      const firstChunk = exactMatches.find(m => {
        const meta = m.metadata as SupabaseDocumentMetadata;
        return meta?.section_index === 0;
      });
      if (firstChunk) {
        console.log(`[Follow-up Link] Using section_index: 0 (first chunk)`);
      }
    }
    
    // Select from exact matches only
    const match = exactMatches.find(m => {
      const meta = m.metadata as SupabaseDocumentMetadata;
      return meta?.section_index === 0;
    }) || exactMatches[0];
    
    // Convert Supabase result to KBEntry format
    const metadata = match.metadata as SupabaseDocumentMetadata;
    const rawContentSections = metadata.content_sections as Partial<ContentSections> | undefined;
    const contentSections: ContentSections = {
      has_content: rawContentSections?.has_content ?? false,
      has_action_tips: rawContentSections?.has_action_tips ?? false,
      has_motivation: rawContentSections?.has_motivation ?? false,
      has_followup: rawContentSections?.has_followup ?? false,
      has_habit_strategy: rawContentSections?.has_habit_strategy ?? false,
    };
    
    const kbEntry: KBEntry = {
      id: match.id || '',
      content: match.content,
      metadata: {
        persona: metadata.persona || '',
        topic: metadata.topic || '',
        subtopic: metadata.subtopic || '',
        keywords: metadata.keywords || [],
        intent_patterns: metadata.intent_patterns || [],
        content_sections: contentSections,
        follow_up_links: metadata.follow_up_links as FollowUpLink[] | undefined,
        source: metadata.source,
        section_index: metadata.section_index,
      },
    };
    
    console.log(`[Follow-up Link] ✅ Retrieved KB entry: ${metadata.persona} > ${metadata.topic} > ${metadata.subtopic}`);
    return kbEntry;
    
  } catch (error) {
    console.error(`[Follow-up Link] Unexpected error in retrieveKBEntryByMetadata:`, error);
    return null;
  }
}

/**
 * Find follow-up link by matching query to any link label in the database
 * Simplified: No history checking, direct match by label across all documents
 */
/**
 * Find follow-up link by query - ONLY matches when user clicks a follow-up link
 * Uses subtopic as stable identifier (not label, which can change)
 * NO LLM routing - returns verbatim KB content only
 */
async function findFollowUpLinkByQuery(userQuery: string): Promise<FollowUpLink | null> {
  try {
    const supabaseClient = getSupabaseAdmin();
    const normalizedQuery = userQuery.toLowerCase().trim();
    
    // SAFEGUARD: Skip very short queries (< 3 chars) - these are greetings, not follow-up links
    if (normalizedQuery.length < 3) {
      console.log(`[Follow-up Link] Skipping very short query: "${userQuery}" (likely not a follow-up link)`);
      return null;
    }
    
    // Query all documents with follow_up_links
    const { data: documents, error } = await supabaseClient
      .from('documents')
      .select('id, metadata')
      .not('metadata->follow_up_links', 'is', null);
    
    if (error) {
      console.error(`[Follow-up Link] Error querying documents: ${error.message}`);
      return null;
    }
    
    if (!documents || documents.length === 0) {
      return null;
    }
    
    // Search through all follow_up_links - PRIORITIZE subtopic (stable identifier)
    for (const doc of documents) {
      const metadata = doc.metadata as SupabaseDocumentMetadata;
      const followUpLinks = metadata.follow_up_links as FollowUpLink[] | undefined;
      
      if (!followUpLinks || followUpLinks.length === 0) {
        continue;
      }
      
      // PRIORITY 1: Exact subtopic match (stable identifier - this is what frontend sends on link click)
      // Only real link clicks send this exact text; plain-text queries must not match.
      for (const link of followUpLinks) {
        const linkSubtopic = link.subtopic.toLowerCase().trim();
        if (linkSubtopic === normalizedQuery) {
          console.log(`[Follow-up Link] ✅ Exact subtopic match found: "${link.subtopic}"`);
          return link;
        }
      }
      
      // PRIORITY 2: Exact label match (when frontend sends label on link click)
      // Require >= 5 chars to avoid matching short greetings as links
      if (normalizedQuery.length >= 5) {
        for (const link of followUpLinks) {
          const linkLabel = link.label.toLowerCase().trim();
          if (linkLabel === normalizedQuery) {
            console.log(`[Follow-up Link] ✅ Exact label match found: "${link.label}"`);
            return link;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[Follow-up Link] Error finding link:`, error);
    return null;
  }
}

/**
 * Handle follow-up link routing - DIRECT KB retrieval ONLY, NO LLM
 * When user clicks a follow-up link, always route to exact KB document
 * Bypasses ALL LLM processing, persona classification, and reasoning
 * Returns verbatim KB content immediately
 */
async function handleFollowUpLinkRouting(
  userQuery: string,
  persona?: Persona,
  mode?: RetrievalMode
): Promise<OrchestrationResult | null> {
  // Find matching follow-up link across all documents
  const matchedLink = await findFollowUpLinkByQuery(userQuery);
  
  if (!matchedLink) {
    // No matching link found - return null to use default flow (which may use LLM)
    return null;
  }
  
  console.log(`[Follow-up Link] ✅ Match found! Query: "${userQuery.substring(0, 50)}" -> Target: ${matchedLink.topic} > ${matchedLink.subtopic}`);
  console.log(`[Follow-up Link] 🚫 Bypassing LLM - returning verbatim KB content only`);
  
  // Retrieve the target KB entry directly by metadata
  // NO LLM processing - direct KB lookup only
  const linkedEntry = await retrieveKBEntryByMetadata(
    matchedLink.persona,
    matchedLink.topic,
    matchedLink.subtopic
  );
  
  if (!linkedEntry) {
    console.log(`[Follow-up Link] ⚠️ Target document not found: ${matchedLink.persona} > ${matchedLink.topic} > ${matchedLink.subtopic}`);
    // Even if KB entry not found, don't fall back to LLM - return null to let normal flow handle it
    return null;
  }
  
  // Return verbatim response - NO LLM, NO reasoning, NO questions
  // Just the raw KB content formatted for display
  const verbatimResponse = formatVerbatimResponse([linkedEntry], true);
  const personaForMode = matchedLink.persona === "menopause" ? "menopause_specialist" : matchedLink.persona as Persona;
  const retrievalModeForLink = mode || getRetrievalMode(personaForMode);
  
  console.log(`[Follow-up Link] ✅ Returning verbatim KB content (NO LLM): ${matchedLink.topic} > ${matchedLink.subtopic} (persona: ${personaForMode})`);
  
  return {
    response: verbatimResponse,
    persona: personaForMode,
    retrievalMode: retrievalModeForLink,
    usedKB: true,
    source: "kb",
    kbEntries: [linkedEntry],
    isVerbatim: true,
  };
}

/**
 * Main RAG orchestration function
 * 
 * @param userQuery - User's query message
 * @param userId - User ID for tracking
 * @param sessionId - Session ID for conversation memory
 * @param mode - Optional retrieval mode (defaults based on persona)
 * @param userProfile - Optional user profile data
 * @param trackerContext - Optional tracker context
 * @param conversationHistory - Optional conversation history (legacy support)
 */
export async function orchestrateRAG(
  userQuery: string,
  userId: string,
  sessionId: string,
  mode?: RetrievalMode,
  userProfile?: unknown,
  trackerContext?: string,
  conversationHistory?: Array<["user" | "assistant", string]>
): Promise<OrchestrationResult> {
  try {
    // STEP 0: PRIORITY CHECK - Follow-up link routing (BEFORE persona classification)
    // If user clicked a follow-up link, ALWAYS route to KB document verbatim, regardless of persona
    // This bypasses all persona classification and LLM routing
    console.log(`[RAG Orchestrator] Checking for follow-up link match...`);
    const linkResult = await handleFollowUpLinkRouting(userQuery);
    if (linkResult) {
      console.log(`[RAG Orchestrator] ✅ Follow-up link matched - returning verbatim KB content (bypassing persona classification)`);
      return linkResult;
    }
    
    // Step 1: Get conversation history from memory
    const memoryHistory = getConversationHistory(sessionId);
    const allHistory = conversationHistory || memoryHistory.map(msg => [msg.role, msg.content] as ["user" | "assistant", string]);

    // Step 1.5: Context-aware query rewriting for follow-ups
    // Detects short/ambiguous messages ("yes", "tell me more") and rewrites them
    // into standalone search queries using conversation history context.
    // Self-contained queries pass through unchanged (zero extra latency).
    const { rewrittenQuery: queryForKB, wasRewritten } = await rewriteQueryWithContext(userQuery, allHistory);
    if (wasRewritten) {
      console.log(`[RAG Orchestrator] Query rewritten for retrieval: "${userQuery}" → "${queryForKB}"`);
    }
    
    // Step 2: Classify persona - use rewritten query so persona routing is also context-aware
    let persona = await classifyPersona(wasRewritten ? queryForKB : userQuery);
    
    // Use the rewritten query for all downstream matching when available
    const effectiveQuery = wasRewritten ? queryForKB : userQuery;
    
    // SAFEGUARD: Skip exact intent matching for very short queries (< 4 chars)
    // These are likely greetings (hey, hi, ok) and shouldn't trigger verbatim responses
    const normalizedQuery = effectiveQuery.toLowerCase().trim();
    const shouldCheckExactIntent = normalizedQuery.length >= 4;
    
    // CRITICAL FIX: Check for exact intent pattern matches across ALL personas FIRST
    // This ensures exact matches always return verbatim responses regardless of persona classification
    // or follow-up detection - if intent matches exactly, return verbatim from whichever persona has it
    // BUT skip for very short queries that are likely greetings
    const exactIntentMatches = shouldCheckExactIntent 
      ? await checkExactIntentMatchAcrossAllPersonas(effectiveQuery, 3)
      : [];
    
    if (exactIntentMatches.length > 0) {
      // Found exact intent match - return verbatim immediately
      // Use the persona from the matched document, not the classified one
      const matchedPersona = exactIntentMatches[0].metadata.persona;
      const personaForMode = matchedPersona === "menopause" ? "menopause_specialist" : matchedPersona as Persona;
      const retrievalModeForMatch = mode || getRetrievalMode(personaForMode);
      
      console.log(`[RAG Orchestrator] ✅ Exact intent match found across all personas - returning verbatim from persona: ${matchedPersona} (classified as: ${persona})`);
      const verbatimResponse = formatVerbatimResponse(exactIntentMatches, true);
      return {
        response: verbatimResponse,
        persona: personaForMode,
        retrievalMode: retrievalModeForMatch,
        usedKB: true,
        source: "kb",
        kbEntries: exactIntentMatches,
        isVerbatim: true,
      };
    }
    
    // Step 2.5: Determine retrieval mode (if no exact match found, use classified persona)
    const retrievalMode = mode || getRetrievalMode(persona);

    // Step 2.6: Check for WHY hormone questions and potentially route to menopause persona
    
    // Step 2.6: Check for WHY hormone questions and potentially route to menopause persona
    // If it's a pure WHY hormone question (not asking for a plan), route to menopause
    // If it's asking for a plan + why, keep the persona and let prompt builder handle redirect
    const isWhyHormone = isWhyHormoneQuestion(effectiveQuery);
    const isAskingForPlan = /\b(plan|routine|workout|meal|diet|program|schedule)\b/i.test(effectiveQuery);
    
    if (isWhyHormone && shouldRouteWhyToMenopause(persona, effectiveQuery)) {
      // If user is asking for a plan + why, keep the persona (prompt builder will add redirect)
      // Otherwise, route to menopause specialist for pure WHY questions
      if (!isAskingForPlan) {
        console.log(`[RAG Orchestrator] WHY hormone question detected - routing to menopause specialist`);
        persona = "menopause_specialist";
        // Update retrieval mode after persona change (menopause_specialist uses kb_strict)
        const newRetrievalMode = getRetrievalMode(persona);
        // Re-check exact intent with new persona
        const exactIntentCheckAfterRouting = await retrieveFromKBByIntentOnly(effectiveQuery, persona, 3, 0.80);
        if (exactIntentCheckAfterRouting.hasMatch && exactIntentCheckAfterRouting.kbEntries.length > 0) {
          console.log(`[RAG Orchestrator] ✅ Exact intent match found after persona routing - returning verbatim`);
          const verbatimResponse = formatVerbatimResponse(exactIntentCheckAfterRouting.kbEntries, true);
          return {
            response: verbatimResponse,
            persona,
            retrievalMode: newRetrievalMode,
            usedKB: true,
            source: "kb",
            kbEntries: exactIntentCheckAfterRouting.kbEntries,
            isVerbatim: true,
          };
        }
      } else {
        console.log(`[RAG Orchestrator] WHY hormone question + plan request - keeping ${persona} persona with redirect instruction`);
      }
    }
    
    // Step 3: Retrieval mode already determined (set earlier)

    console.log(`[RAG Orchestrator] Original query: "${userQuery}"${wasRewritten ? ` → Rewritten: "${queryForKB}"` : ""}`);
    console.log(`[RAG Orchestrator] Classified persona: ${persona}`);
    console.log(`[RAG Orchestrator] Retrieval mode: ${retrievalMode}`);

    // Step 4: Handle based on retrieval mode - use queryForKB for retrieval
    if (retrievalMode === "kb_strict") {
      return await handleKBStrictMode(queryForKB, persona, retrievalMode, userProfile, trackerContext, allHistory);
    } else if (retrievalMode === "hybrid") {
      return await handleHybridMode(queryForKB, persona, retrievalMode, userProfile, trackerContext, allHistory);
    } else {
      // llm_reasoning mode - pass enhanced query and original for context
      return await handleLLMReasoningMode(queryForKB, persona, retrievalMode, userProfile, trackerContext, allHistory);
    }
  } catch (error) {
    console.error("Error in RAG orchestration:", error);
    // Fallback to basic LLM response
    return {
      response: "I apologize, but I encountered an error processing your request. Could you please try rephrasing your question?",
      persona: "menopause_specialist",
      retrievalMode: "llm_reasoning",
      usedKB: false,
      source: "llm",
    };
  }
}

/**
 * Handle kb_strict mode (Menopause Specialist)
 * Returns KB content if match found, null if no match
 */
async function handleKBStrictMode(
  userQuery: string,
  persona: Persona,
  mode: RetrievalMode,
  _userProfile?: unknown,
  _trackerContext?: string,
  _conversationHistory?: Array<["user" | "assistant", string]>
): Promise<OrchestrationResult> {
  console.log(`[KB Strict Mode] Active for query: "${userQuery}"`);
  console.log(`[KB Strict Mode] Using STRICT INTENT-BASED RETRIEVAL`);
  console.log(`[KB Strict Mode] Documents must have intent match score >= 0.80`);
  
  // Use strict intent-based retrieval (intent threshold = 0.80)
  // Falls back to semantic similarity if no intent matches found
  const retrievalResult = await retrieveFromKBByIntentOnly(userQuery, persona, 3, 0.80);

  // CRITICAL: Check for exact intent match first - always return verbatim if found
  const exactMatch = findExactIntentMatch(retrievalResult, userQuery);
  if (exactMatch) {
    console.log(`[KB Strict Mode] ✅ EXACT INTENT MATCH - VERBATIM RESPONSE triggered`);
    const verbatimResponse = formatVerbatimResponse([exactMatch.entry], true); // Pass excludeMetadata=true
    
    return {
      response: verbatimResponse,
      persona,
      retrievalMode: mode,
      usedKB: true,
      source: "kb",
      kbEntries: [exactMatch.entry],
      isVerbatim: true,
    };
  }

  // Enhanced logging with semantic and hybrid scores
  console.log(`[KB Strict Mode] Retrieval results:`);
  console.log(`  - Has match: ${retrievalResult.hasMatch}`);
  console.log(`  - KB entries found: ${retrievalResult.kbEntries.length}`);
  if (retrievalResult.topScore !== undefined) {
    console.log(`  - Top hybrid score: ${retrievalResult.topScore.toFixed(3)}`);
  }
  if (retrievalResult.topSemanticScore !== undefined) {
    console.log(`  - Top semantic score: ${retrievalResult.topSemanticScore.toFixed(3)}`);
  }
  if (retrievalResult.kbEntries.length > 0) {
    console.log(`  - Entry details:`);
    retrievalResult.kbEntries.forEach((entry, idx) => {
      const hybridScore = (entry.similarity ?? 0).toFixed(3);
      const semanticScore = (entry.semanticSimilarity ?? 0).toFixed(3);
      console.log(`    [${idx + 1}] Hybrid: ${hybridScore} | Semantic: ${semanticScore} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
    });
  }

  // TRUST RETRIEVAL RESULTS only when BOTH intent and semantic agree (prevents wrong-topic verbatim)
  // Semantic gate: require topSemanticScore >= 0.30 so queries like "i don't feel like myself anymore"
  // don't get verbatim from a doc that matched only on fuzzy intent (e.g. word "anymore") with low semantic
  const SEMANTIC_THRESHOLD_VERBATIM = 0.30;
  const semanticOkForVerbatim =
    retrievalResult.topSemanticScore !== undefined &&
    retrievalResult.topSemanticScore >= SEMANTIC_THRESHOLD_VERBATIM;

  if (retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0 && semanticOkForVerbatim) {
    console.log(`[KB Strict Mode] ✅ VERBATIM RESPONSE triggered (intent + semantic gate passed)`);
    if (retrievalResult.topSemanticScore !== undefined) {
      console.log(`  - Top semantic score: ${retrievalResult.topSemanticScore.toFixed(3)} >= ${SEMANTIC_THRESHOLD_VERBATIM}`);
    }
    if (retrievalResult.topScore !== undefined) {
      console.log(`  - Top hybrid score: ${retrievalResult.topScore.toFixed(3)}`);
    }

    // Layer 2: LLM relevance gate — verify the KB entry actually answers the query
    const topEntry = retrievalResult.kbEntries[0];
    const isRelevant = await verifyKBRelevance(
      userQuery,
      topEntry.metadata.topic,
      topEntry.metadata.subtopic,
    );

    if (isRelevant) {
      const verbatimResponse = formatVerbatimResponse(retrievalResult.kbEntries, true);
      return {
        response: verbatimResponse,
        persona,
        retrievalMode: mode,
        usedKB: true,
        source: "kb",
        kbEntries: retrievalResult.kbEntries,
        isVerbatim: true,
      };
    }

    console.log(`[KB Strict Mode] ❌ Relevance gate rejected verbatim — falling through to LLM`);
  }

  if (retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0 && !semanticOkForVerbatim) {
    console.log(`[KB Strict Mode] ❌ Verbatim skipped: semantic score below threshold (top semantic: ${retrievalResult.topSemanticScore?.toFixed(3) ?? "n/a"} < ${SEMANTIC_THRESHOLD_VERBATIM}) → LLM fallback`);
  }

  // No KB match (or semantic gate failed) - continue to refusal check / LLM fallback
  if (!retrievalResult.hasMatch || retrievalResult.kbEntries.length === 0) {
    console.log(`[KB Strict Mode] ❌ No verbatim response (no KB entries found)`);
  }

  // No KB match - check safety (mode-aware)
  const hasKBAnswer = retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0;
  const safetyCheck = validateMenopauseQuery(userQuery, mode, hasKBAnswer);

  if (safetyCheck.refused) {
    console.log(`[KB Strict Mode] Query refused, returning refusal response`);
    // Return polite refusal
    return {
      response: safetyCheck.reason || generateRefusalResponse(userQuery),
      persona,
      retrievalMode: mode,
      usedKB: false,
      source: "llm",
    };
  }

  // No KB match and query is allowed - return null response (route will handle LLM)
  console.log(`[KB Strict Mode] No KB match found, returning null for LLM fallback`);
  return {
    persona,
    retrievalMode: mode,
    usedKB: false,
    source: "llm",
  };
}

/**
 * Handle hybrid mode (Nutrition Coach, Exercise Trainer)
 * Tries KB first, falls back to LLM if no KB match
 */
async function handleHybridMode(
  userQuery: string,
  persona: Persona,
  mode: RetrievalMode,
  _userProfile?: unknown,
  _trackerContext?: string,
  _conversationHistory?: Array<["user" | "assistant", string]>
): Promise<OrchestrationResult> {
  console.log(`[Hybrid Mode] Active for query: "${userQuery}"`);
  
  // Retrieve KB entries with lower threshold for hybrid mode
  const similarityThreshold = 0.5;
  const retrievalResult = await retrieveFromKB(userQuery, persona, 5, similarityThreshold);

  // IMPROVED: Dual threshold system for hybrid mode verbatim responses
  // Slightly lower thresholds than kb_strict since hybrid mode is more flexible
  // Semantic threshold: 0.35 (primary gate - lower to catch paraphrases)
  // Hybrid threshold: adaptive (already applied in retrieval, typically 0.44-0.50)
  const semanticThreshold = 0.35;  // Lower to catch paraphrases
  
  console.log(`[Hybrid Mode] Retrieval results:`);
  console.log(`  - Has match: ${retrievalResult.hasMatch}`);
  console.log(`  - KB entries found: ${retrievalResult.kbEntries.length}`);
  if (retrievalResult.topScore !== undefined) {
    console.log(`  - Top hybrid score: ${retrievalResult.topScore.toFixed(3)}`);
  }
  if (retrievalResult.topSemanticScore !== undefined) {
    console.log(`  - Top semantic score: ${retrievalResult.topSemanticScore.toFixed(3)}`);
  }
  if (retrievalResult.kbEntries.length > 0) {
    console.log(`  - Entry details:`);
    retrievalResult.kbEntries.forEach((entry, idx) => {
      const hybridScore = (entry.similarity ?? 0).toFixed(3);
      const semanticScore = (entry.semanticSimilarity ?? 0).toFixed(3);
      console.log(`    [${idx + 1}] Hybrid: ${hybridScore} | Semantic: ${semanticScore} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
    });
  }

  // CRITICAL: Check for exact intent match first - always return verbatim if found
  const exactMatch = findExactIntentMatch(retrievalResult, userQuery);
  if (exactMatch) {
    console.log(`[Hybrid Mode] ✅ EXACT INTENT MATCH - VERBATIM RESPONSE triggered`);
    const verbatimResponse = formatVerbatimResponse([exactMatch.entry], false);
    
    return {
      response: verbatimResponse,
      persona,
      retrievalMode: mode,
      usedKB: true,
      source: "kb",
      kbEntries: [exactMatch.entry],
      isVerbatim: true,
    };
  }

  // IMPROVED: Check for verbatim response opportunity (strong KB match)
  // For hybrid mode, we use adaptive threshold from retrieval (already applied)
  // So if entries passed retrieval filters, they're good candidates for verbatim
  const hasSemanticMatch = retrievalResult.topSemanticScore !== undefined && retrievalResult.topSemanticScore >= semanticThreshold;
  const hasGoodHybridMatch = retrievalResult.topScore !== undefined && retrievalResult.topScore >= 0.45; // Adaptive threshold already applied, just verify it's reasonable
  
  if (retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0 && hasSemanticMatch && hasGoodHybridMatch) {
    console.log(`[Hybrid Mode] ✅ VERBATIM RESPONSE triggered`);
    console.log(`  - Semantic: ${retrievalResult.topSemanticScore!.toFixed(3)} >= ${semanticThreshold} ✓`);
    console.log(`  - Hybrid: ${retrievalResult.topScore!.toFixed(3)} >= 0.45 ✓`);

    // Layer 2: LLM relevance gate — verify the KB entry actually answers the query
    const topEntry = retrievalResult.kbEntries[0];
    const isRelevant = await verifyKBRelevance(
      userQuery,
      topEntry.metadata.topic,
      topEntry.metadata.subtopic,
    );

    if (isRelevant) {
      const verbatimResponse = formatVerbatimResponse(retrievalResult.kbEntries);
      return {
        response: verbatimResponse,
        persona,
        retrievalMode: mode,
        usedKB: true,
        source: "kb",
        kbEntries: retrievalResult.kbEntries,
        isVerbatim: true,
      };
    }

    console.log(`[Hybrid Mode] ❌ Relevance gate rejected verbatim — falling through to hybrid LLM`);
  }

  // No strong match - use KB context with LLM (hybrid approach)
  if (retrievalResult.topSemanticScore !== undefined || retrievalResult.topScore !== undefined) {
    const semanticStatus = hasSemanticMatch ? '✓' : '✗';
    const hybridStatus = hasGoodHybridMatch ? '✓' : '✗';
    console.log(`[Hybrid Mode] No verbatim response (using hybrid LLM approach):`);
    if (retrievalResult.topSemanticScore !== undefined) {
      console.log(`  - Semantic: ${retrievalResult.topSemanticScore.toFixed(3)} ${semanticStatus} (threshold: ${semanticThreshold})`);
    }
    if (retrievalResult.topScore !== undefined) {
      console.log(`  - Hybrid: ${retrievalResult.topScore.toFixed(3)} ${hybridStatus} (threshold: 0.45)`);
    }
  }

  // For hybrid mode, return KB context for route to use with LLM (with tools)
  let kbContext = "";
  if (retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0) {
    kbContext = formatKBContextForLLM(retrievalResult.kbEntries);
    console.log(`[Hybrid Mode] KB context provided to LLM (${retrievalResult.kbEntries.length} entries)`);
  } else {
    console.log(`[Hybrid Mode] No KB context (will use LLM only)`);
  }

  return {
    persona,
    retrievalMode: mode,
    usedKB: retrievalResult.hasMatch,
    source: retrievalResult.hasMatch ? "kb" : "llm",
    kbEntries: retrievalResult.kbEntries,
    kbContext,
  };
}

/**
 * Handle llm_reasoning mode (Empathy Companion)
 * For follow-up questions, tries KB first even in llm_reasoning mode
 */
async function handleLLMReasoningMode(
  userQuery: string, // This is already enhanced if it was a follow-up
  persona: Persona,
  mode: RetrievalMode,
  _userProfile?: unknown,
  _trackerContext?: string,
  conversationHistory?: Array<["user" | "assistant", string]>
): Promise<OrchestrationResult> {
  // For follow-up questions, try KB first even in llm_reasoning mode
  // If query is already enhanced (has extra context words) or we have history, try KB
  const history = conversationHistory || [];
  const hasHistory = history.length > 0;
  
  // Check if query looks like it might be a follow-up (short or has follow-up patterns)
  // Note: query might already be enhanced, so we check the original patterns
  const normalized = userQuery.toLowerCase().trim();
  const looksLikeFollowUp = hasHistory && (
    normalized.length < 30 || 
    /^(what|how|why|tell|more|about|that|this|it)\b/i.test(normalized)
  );
  
  if (looksLikeFollowUp) {
    console.log(`[LLM Reasoning Mode] Follow-up question detected - attempting KB search first`);
    // Query is already enhanced from orchestrateRAG, use it directly
    const retrievalResult = await retrieveFromKB(userQuery, persona, 3, 0.4);
    
    // CRITICAL: Check for exact intent match first - always return verbatim if found
    const exactMatch = findExactIntentMatch(retrievalResult, userQuery);
    if (exactMatch) {
      console.log(`[LLM Reasoning Mode] ✅ EXACT INTENT MATCH - VERBATIM RESPONSE triggered`);
      const verbatimResponse = formatVerbatimResponse([exactMatch.entry], false);
      
      return {
        response: verbatimResponse,
        persona,
        retrievalMode: mode,
        usedKB: true,
        source: "kb",
        kbEntries: [exactMatch.entry],
        isVerbatim: true,
      };
    }
    
    if (retrievalResult.hasMatch && retrievalResult.kbEntries.length > 0) {
      console.log(`[LLM Reasoning Mode] KB match found for follow-up, using KB context`);
      const kbContext = formatKBContextForLLM(retrievalResult.kbEntries);
      return {
        persona,
        retrievalMode: mode,
        usedKB: true,
        source: "kb",
        kbEntries: retrievalResult.kbEntries,
        kbContext,
      };
    }
  }
  
  // Also check for exact intent match even if not a follow-up
  // This ensures exact matches always trigger verbatim regardless of mode
  const regularRetrievalResult = await retrieveFromKB(userQuery, persona, 3, 0.3);
  const exactMatchRegular = findExactIntentMatch(regularRetrievalResult, userQuery);
  if (exactMatchRegular) {
    console.log(`[LLM Reasoning Mode] ✅ EXACT INTENT MATCH - VERBATIM RESPONSE triggered`);
    const verbatimResponse = formatVerbatimResponse([exactMatchRegular.entry], false);
    
    return {
      response: verbatimResponse,
      persona,
      retrievalMode: mode,
      usedKB: true,
      source: "kb",
      kbEntries: [exactMatchRegular.entry],
      isVerbatim: true,
    };
  }
  
  console.log(`[LLM Reasoning Mode] Active - skipping KB, using LLM only`);
  // For llm_reasoning mode, return empty response, route will handle LLM with tools
  return {
    persona,
    retrievalMode: mode,
    usedKB: false,
    source: "llm",
  };
}
