/**
 * Retrieval Module - OPTIMIZED for 100% accuracy and fast performance
 * 
 * IMPROVEMENTS:
 * 1. Direct database queries with ACTUAL similarity scores (not position-based approximation)
 * 2. Database-level persona filtering (not post-filtering in JavaScript)
 * 3. Query normalization and expansion for better matching
 * 4. Real similarity scores used in hybrid re-ranking
 * 5. Optimized scoring weights for maximum accuracy
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import type { Document } from "@langchain/core/documents";
import type { KBEntry, Persona, RetrievalResult, ContentSections } from "./types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Type for match results from Supabase RPC
interface MatchResult {
  content: string;
  metadata: {
    id?: string;
    persona?: string;
    topic?: string;
    subtopic?: string;
    keywords?: string[];
    intent_patterns?: string[];
    content_sections?: Partial<ContentSections>;
    source?: string;
    section_index?: number;
  };
  similarity: number;
}

// Initialize embeddings - using text-embedding-3-large with dimension reduction
// Upgraded from text-embedding-3-small for better semantic understanding and retrieval accuracy
// Reduced to 1536 dimensions to fit Supabase's 2000-dim limit while maintaining better quality than small model
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-large",
  dimensions: 1536, // Reduced from 3072 to fit database limit, but still better than text-embedding-3-small
});

/**
 * Normalize and expand query for better matching
 * Handles common variations, synonyms, and related terms
 */
function normalizeAndExpandQuery(query: string): string {
  // Normalize query
  const normalized = query.trim().toLowerCase();
  
  // Expand common menopause-related synonyms and related terms
  const synonymMap: Record<string, string[]> = {
    'hot flash': ['hot flashes', 'night sweats', 'vasomotor symptoms', 'flushing'],
    'night sweat': ['night sweats', 'hot flashes', 'vasomotor symptoms'],
    'pee': ['urination', 'urinary', 'bladder', 'frequent urination'],
    'urinate': ['urination', 'urinary', 'bladder', 'frequent urination'],
    'weight gain': ['weight management', 'metabolism', 'metabolic changes', 'weight'],
    'sleep': ['insomnia', 'sleep disturbances', 'sleep problems', 'sleeping'],
    'bone': ['osteoporosis', 'bone health', 'bone density', 'bones'],
    'sex': ['sexual health', 'intimacy', 'libido', 'sexual'],
    'pelvic': ['pelvic floor', 'bladder health', 'pelvic'],
    'mood': ['mood swings', 'emotional', 'depression', 'anxiety'],
    'energy': ['fatigue', 'tired', 'exhaustion', 'low energy'],
  };

  // Add synonyms to query
  const words = normalized.split(/\s+/);
  const expandedTerms: string[] = [query]; // Keep original query first
  
  // Check for multi-word matches first
  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (normalized.includes(key)) {
      expandedTerms.push(...synonyms);
    }
  }
  
  // Check for single word matches
  for (const word of words) {
    if (word.length > 3) {
      for (const [key, synonyms] of Object.entries(synonymMap)) {
        if (key.includes(word) || word.includes(key.split(' ')[0])) {
          expandedTerms.push(...synonyms);
        }
      }
    }
  }

  // Combine original query with expanded terms (deduplicated)
  const allTerms = [...new Set(expandedTerms)];
  return allTerms.join(' ');
}

/**
 * Extract keywords from user query for hybrid search
 */
function extractQueryKeywords(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'the', 'this', 'i', 'you',
    'how', 'why', 'what', 'when', 'where', 'can', 'could', 'should',
    'would', 'do', 'does', 'did', 'am', 'my', 'me', 'we', 'our'
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Synonym map for intent pattern matching
 * Maps common words to their synonyms for better semantic matching
 */
const intentSynonymMap: Record<string, string[]> = {
  'wake': ['awaken', 'awake', 'waking', 'woke'],
  'sleep': ['rest', 'slumber', 'sleeping', 'asleep'],
  'night': ['evening', 'nighttime', 'nocturnal'],
  'every': ['each', 'all', 'always'],
  'cannot': ['can\'t', 'can not', 'unable'],
  'can\'t': ['cannot', 'can not', 'unable'],
  'insomnia': ['sleeplessness', 'sleep problems', 'sleep issues', 'sleep disturbance'],
  'hot flash': ['hot flashes', 'flushing', 'vasomotor'],
  'sweat': ['sweating', 'perspire'],
  'tired': ['exhausted', 'fatigued', 'weary'],
  'fall': ['go to', 'get to'],
  'asleep': ['sleep', 'sleeping'],
  'awake': ['wake', 'waking'],
  'rest': ['sleep', 'resting'],
  'evening': ['night', 'nighttime'],
  'each': ['every', 'all'],
  'always': ['every', 'each'],
  // State description equivalences - ensures "why am i so foggy?" matches "why do I feel foggy?"
  'so': ['feel', 'very', 'really', 'quite'],
  'feel': ['so', 'very', 'really', 'quite', 'seem'],
  'very': ['so', 'feel', 'really', 'quite'],
  'really': ['so', 'feel', 'very', 'quite'],
  // Temporal phrase variations for robust matching
  'at night': ['every night', 'each night', 'nightly', 'during the night', 'in the night', 'throughout the night'],
  'every night': ['at night', 'each night', 'nightly', 'night after night'],
  'each night': ['every night', 'at night', 'nightly'],
  // Sudden / rapid onset (weight and similar intents)
  'suddenly': ['overnight', 'fast', 'quickly', 'rapid', 'sudden'],
  'sudden': ['suddenly', 'overnight', 'fast'],
  'overnight': ['suddenly', 'fast', 'quickly'],
  'fast': ['suddenly', 'quickly', 'overnight', 'rapid'],
  'quickly': ['fast', 'suddenly', 'overnight'],
  'rapid': ['fast', 'quickly', 'suddenly'],
  // Weight-gain phrasing (Overview "sudden fat" vs user "gain weight")
  'weightgain': ['gain', 'gaining', 'weight', 'fat', 'overweight'],
  'gain': ['gaining', 'gained', 'weight', 'weightgain'],
  'gaining': ['gain', 'weight', 'weightgain'],
  'gained': ['gain', 'gaining', 'weightgain'],
  'weight': ['gain', 'gaining', 'fat', 'overweight', 'weightgain'],
  'fat': ['weight', 'overweight', 'gain', 'gaining', 'weightgain'],
  'overweight': ['fat', 'weight', 'gain', 'weightgain'],
};

/**
 * Expand a word with its synonyms
 */
function expandSynonyms(word: string, synonymMap: Record<string, string[]>): Set<string> {
  const expanded = new Set<string>([word]);
  
  // Check if word is a key in the map
  if (synonymMap[word]) {
    synonymMap[word].forEach(syn => expanded.add(syn));
  }
  
  // Check if word is a synonym of any key
  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (synonyms.includes(word)) {
      expanded.add(key);
      synonyms.forEach(syn => expanded.add(syn));
    }
  }
  
  return expanded;
}

/**
 * Normalize text for intent pattern matching
 * Removes punctuation, normalizes whitespace, and expands contractions
 * FIX: Comprehensive temporal phrase normalization for robust matching
 */
export function normalizeTextForIntentMatching(text: string): string {
  let normalized = text.toLowerCase().replace(/[?!.,;:]/g, '').trim();
  
  // Expand common contractions and variations
  normalized = normalized.replace(/\b(can't|cannot|can not)\b/g, 'cannot');
  normalized = normalized.replace(/\b(won't|will not)\b/g, 'will not');
  normalized = normalized.replace(/\b(don't|do not)\b/g, 'do not');
  normalized = normalized.replace(/\b(i'm|i am)\b/g, 'i am');
  normalized = normalized.replace(/\b(it's|it is)\b/g, 'it is');
  
  // NEW: Normalize "am/are/is [so/very/really] [adjective]" to "feel [adjective]"
  // This ensures "why am i so foggy?" matches "why do I feel foggy?"
  normalized = normalized.replace(/\b(am|are|is)\s+(so|very|really|quite)\s+([a-z]{3,})\b/g, 'feel $3');
  
  // NEW: Normalize "so [adjective]" to "feel [adjective]" (when not after am/are/is)
  // This handles standalone "so" as intensifier
  normalized = normalized.replace(/\bso\s+([a-z]{3,})\b/g, 'feel $1');

  // Weight-gain intent: single canonical token so "gain weight", "gaining weight",
  // "feel/get fat", etc. align with KB patterns like "Why am I suddenly so fat?"
  normalized = normalized.replace(/\b(gain|gaining|gained)\s+weight\b/g, 'weightgain');
  normalized = normalized.replace(/\b(feel|feeling)\s+fat\b/g, 'weightgain');
  normalized = normalized.replace(/\b(get|getting|got)\s+fat\b/g, 'weightgain');
  normalized = normalized.replace(/\bweight\s+going\s+up\b/g, 'weightgain');
  normalized = normalized.replace(/\ball\s+of\s+a\s+sudden\b/g, 'suddenly');
  normalized = normalized.replace(/\bout\s+of\s+nowhere\b/g, 'suddenly');
  
  // FIX: Comprehensive temporal phrase normalization
  // Handle all variations of "at night" / "every night" patterns
  // This ensures "Why do I wake up at night?" matches "Why do I wake up every night?"
  normalized = normalized.replace(/\b(at|every|each|during|throughout|in)\s+(the\s+)?night(s)?\b/g, 'night');
  normalized = normalized.replace(/\bnightly\b/g, 'night');
  normalized = normalized.replace(/\bnight\s+after\s+night\b/g, 'night');
  
  // Normalize time-specific phrases but preserve numeric context for specificity
  // e.g., "3am" stays as "3am" to distinguish from general night waking
  normalized = normalized.replace(/\b(\d+)\s*(am|pm|a\.m\.|p\.m\.)\b/g, '$1$2');
  
  // Normalize multiple spaces to single space
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Check if query has a perfect match with any intent pattern
 * Perfect match = exact match OR high semantic similarity (>= 0.6 word overlap with synonyms)
 */
function hasPerfectIntentMatch(
  docIntentPatterns: string[],
  userQuery: string
): boolean {
  if (docIntentPatterns.length === 0) return false;
  
  const queryNormalized = normalizeTextForIntentMatching(userQuery);
  
  // SAFEGUARD: Skip perfect intent matching for very short queries (< 4 chars)
  // These are likely greetings (hey, hi, ok) and shouldn't match intent patterns
  if (queryNormalized.length < 4) {
    return false;
  }
  
  for (const pattern of docIntentPatterns) {
    const patternNormalized = normalizeTextForIntentMatching(pattern);
    
    // Exact match
    if (queryNormalized === patternNormalized) {
      console.log(`[Perfect Match] ✅ EXACT MATCH: "${userQuery}" === "${pattern}" (normalized: "${queryNormalized}" === "${patternNormalized}")`);
      return true;
    }
    
    // High semantic similarity with synonym-aware matching
    const stopWords = new Set(['why', 'what', 'how', 'when', 'where', 'can', 'does', 'is', 'are', 'do', 'i', 'my', 'me', 'at', 'in', 'on', 'the', 'a', 'an', 'hey', 'hi', 'ok', 'okay', 'yes', 'no']);
    
    const queryWords = queryNormalized
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    const patternWords = patternNormalized
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // If query has no meaningful words after filtering, skip this pattern
    if (queryWords.length === 0) {
      continue;
    }
    
    if (patternWords.length > 0) {
      // Expand words with synonyms
      const queryWordSet = new Set<string>();
      const patternWordSet = new Set<string>();
      
      queryWords.forEach(word => {
        const expanded = expandSynonyms(word, intentSynonymMap);
        expanded.forEach(w => queryWordSet.add(w));
      });
      
      patternWords.forEach(word => {
        const expanded = expandSynonyms(word, intentSynonymMap);
        expanded.forEach(w => patternWordSet.add(w));
      });
      
      // Calculate overlap with synonym expansion
      const intersection = new Set([...queryWordSet].filter(w => patternWordSet.has(w)));
      const union = new Set([...queryWordSet, ...patternWordSet]);
      
      const wordOverlapScore = intersection.size / union.size;
      
      // High semantic similarity (>= 0.6) treated as perfect match (lowered from 0.75)
      if (wordOverlapScore >= 0.6) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Calculate intent pattern match score
 * IMPROVED: Better semantic matching for variations like "at night" vs "every night"
 */
function calculateIntentPatternScore(
  docIntentPatterns: string[],
  userQuery: string
): number {
  if (docIntentPatterns.length === 0) return 0;

  const queryNormalized = normalizeTextForIntentMatching(userQuery);
  
  // SAFEGUARD: Skip intent matching for very short queries (< 4 chars)
  // These are likely greetings (hey, hi, ok) and shouldn't match intent patterns
  if (queryNormalized.length < 4) {
    return 0;
  }

  let maxScore = 0;
  let primaryIntentMatches = 0;

  for (const pattern of docIntentPatterns) {
    const patternNormalized = normalizeTextForIntentMatching(pattern);
    
    // Check for exact match after normalization (highest priority)
    if (queryNormalized === patternNormalized) {
      maxScore = Math.max(maxScore, 1.0);
      if (pattern.includes('PRIMARY') || !pattern.includes('SECONDARY')) {
        primaryIntentMatches++;
      }
      continue;
    }
    
    // REMOVED: Substring matching is too permissive and causes false matches
    // Examples: "hey" matching "hey, what about...", "sleep" matching "can't sleep at night"
    // Instead, rely on word-based matching below which is more sophisticated and accurate

    // IMPROVED: Word-based matching with synonym-aware semantic similarity
    // Extract meaningful words (exclude common stop words and short words)
    const stopWords = new Set(['why', 'what', 'how', 'when', 'where', 'can', 'does', 'is', 'are', 'do', 'i', 'my', 'me', 'at', 'in', 'on', 'the', 'a', 'an', 'hey', 'hi', 'ok', 'okay', 'yes', 'no']);
    
    const queryWords = queryNormalized
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    const patternWords = patternNormalized
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // If query has no meaningful words after filtering, skip this pattern
    // This prevents greetings and very short queries from matching
    if (queryWords.length === 0) {
      continue;
    }
    
    if (patternWords.length === 0) {
      continue;
    }
    
    // Expand words with synonyms for better matching
    const queryWordSet = new Set<string>();
    const patternWordSet = new Set<string>();
    
    queryWords.forEach(word => {
      queryWordSet.add(word); // Add original word
      const expanded = expandSynonyms(word, intentSynonymMap);
      expanded.forEach(w => queryWordSet.add(w));
    });
    
    patternWords.forEach(word => {
      patternWordSet.add(word); // Add original word
      const expanded = expandSynonyms(word, intentSynonymMap);
      expanded.forEach(w => patternWordSet.add(w));
    });
    
    // Calculate word overlap using Jaccard similarity with synonym expansion
    const intersection = new Set([...queryWordSet].filter(w => patternWordSet.has(w)));
    const union = new Set([...queryWordSet, ...patternWordSet]);
    
    const wordOverlapScore = intersection.size / union.size;
    
    // If high word overlap (>= 0.4, lowered from 0.6), treat as strong match
    // This catches cases like "wake up at night" vs "wake up every night"
    // and "rest at night" vs "sleep" (synonym matching)
    if (wordOverlapScore >= 0.4) {
      // Scale the score: 0.4 overlap = 0.70, 0.6+ overlap = 0.85, 0.8+ overlap = 0.95
      let semanticScore: number;
      if (wordOverlapScore >= 0.8) {
        semanticScore = 0.95;
      } else if (wordOverlapScore >= 0.6) {
        semanticScore = 0.75 + (wordOverlapScore - 0.6) * 0.5; // Maps 0.6->0.75, 0.8->0.85
      } else {
        semanticScore = 0.70 + (wordOverlapScore - 0.4) * 0.25; // Maps 0.4->0.70, 0.6->0.75
      }
      maxScore = Math.max(maxScore, Math.min(0.95, semanticScore));
      
      if (pattern.includes('PRIMARY') || !pattern.includes('SECONDARY')) {
        primaryIntentMatches++;
      }
      continue;
    }
    
    // IMPROVED: Fallback matching with partial word matching and lower threshold
    // Check for partial word matches (e.g., "waking" matches "wake")
    const matchingWords: string[] = [];
    const partialMatches: string[] = [];
    
    for (const patternWord of patternWords) {
      // Exact word match (including synonyms)
      if (queryWordSet.has(patternWord)) {
        matchingWords.push(patternWord);
        continue;
      }
      
      // Partial word match - check if one word contains the other
      for (const queryWord of queryWords) {
        if (patternWord.includes(queryWord) || queryWord.includes(patternWord)) {
          partialMatches.push(patternWord);
          break;
        }
      }
    }
    
    // Calculate score with both exact and partial matches
    // Uses BIDIRECTIONAL coverage (geometric mean of pattern coverage & query coverage)
    // to prevent a single shared keyword from inflating scores when the query
    // asks about something the KB entry doesn't cover
    if (matchingWords.length > 0 || partialMatches.length > 0) {
      const totalMatchWeight = matchingWords.length + partialMatches.length * 0.5;
      const patternCoverage = totalMatchWeight / patternWords.length;
      const queryCoverage = totalMatchWeight / queryWords.length;
      const wordMatchScore = Math.sqrt(patternCoverage * queryCoverage);
      
      // Only consider if score >= 0.3 (lowered threshold)
      if (wordMatchScore >= 0.3) {
        maxScore = Math.max(maxScore, wordMatchScore * 0.7);
        
        if (pattern.includes('PRIMARY') || !pattern.includes('SECONDARY')) {
          primaryIntentMatches++;
        }
      }
    }
  }

  if (primaryIntentMatches > 0) {
    maxScore = Math.min(1.0, maxScore * 1.2);
  }

  return maxScore;
}

/**
 * Calculate keyword match score
 */
function calculateKeywordMatchScore(
  docKeywords: string[],
  queryKeywords: string[],
  userQuery: string
): number {
  if (queryKeywords.length === 0 || docKeywords.length === 0) return 0;

  const queryLower = userQuery.toLowerCase();
  let exactMatches = 0;
  let partialMatches = 0;

  for (const queryKeyword of queryKeywords) {
    for (const docKeyword of docKeywords) {
      const docKwLower = docKeyword.toLowerCase();
      const queryKwLower = queryKeyword.toLowerCase();

      if (docKwLower === queryKwLower || 
          queryLower.includes(docKwLower) || 
          docKwLower.includes(queryKwLower)) {
        exactMatches++;
        break;
      }
      
      if (docKwLower.includes(queryKwLower) || queryKwLower.includes(docKwLower)) {
        partialMatches++;
        break;
      }
    }
  }

  const exactScore = (exactMatches / queryKeywords.length) * 0.8;
  const partialScore = (partialMatches / queryKeywords.length) * 0.4;
  
  return Math.min(1.0, exactScore + partialScore);
}

/**
 * Calculate content section relevance score
 */
function calculateSectionRelevanceScore(
  contentSections: { has_content?: boolean; has_action_tips?: boolean; has_motivation?: boolean; has_followup?: boolean; has_habit_strategy?: boolean } | undefined,
  userQuery: string
): number {
  if (!contentSections) return 0.5;

  let score = 0.5;

  if (/^(how|what should|what can|tell me how|show me)/i.test(userQuery)) {
    if (contentSections.has_action_tips) score += 0.3;
    if (contentSections.has_habit_strategy) score += 0.2;
  }

  if (/^(why|what causes|what's happening|explain)/i.test(userQuery)) {
    if (contentSections.has_content) score += 0.3;
  }

  if (/(motivation|encouragement|support|feeling|discouraged|overwhelmed)/i.test(userQuery)) {
    if (contentSections.has_motivation) score += 0.3;
  }

  if (/(next|follow|more|additional|what else)/i.test(userQuery)) {
    if (contentSections.has_followup) score += 0.2;
  }

  return Math.min(1.0, score);
}

/**
 * Apply hybrid search re-ranking with ACTUAL similarity scores
 * IMPROVED: Uses real similarity scores from database instead of approximation
 */
function applyHybridSearch(
  documents: Array<{ doc: Document; similarity: number }>,
  userQuery: string
): Array<{ doc: Document; score: number; similarity: number; hasPerfectMatch: boolean }> {
  const queryKeywords = extractQueryKeywords(userQuery);

  const scoredDocs = documents.map(({ doc, similarity }) => {
    // Use ACTUAL semantic similarity from database (not approximation)
    const semanticScore = similarity;

    // Extract metadata fields - handle both direct access and nested JSONB structure
    const metadata = doc.metadata || {};
    
    // Intent patterns might be stored as JSONB array - ensure we get it as array
    // Supabase JSONB fields are automatically parsed, but handle edge cases
    let docIntentPatterns: string[] = [];
    const rawIntentPatterns = metadata.intent_patterns;
    
    if (rawIntentPatterns) {
      if (Array.isArray(rawIntentPatterns)) {
        // Already an array - use directly, but ensure all elements are strings
        docIntentPatterns = rawIntentPatterns
          .map(p => typeof p === 'string' ? p : String(p))
          .filter(p => p && p.trim().length > 0);
      } else if (typeof rawIntentPatterns === 'string') {
        // If stored as JSON string, parse it
        try {
          const parsed = JSON.parse(rawIntentPatterns);
          if (Array.isArray(parsed)) {
            docIntentPatterns = parsed
              .map(p => typeof p === 'string' ? p : String(p))
              .filter(p => p && p.trim().length > 0);
          }
        } catch {
          // If parsing fails, treat as single string
          docIntentPatterns = [rawIntentPatterns];
        }
      }
    }
    
    // Keywords - same handling
    let docKeywords: string[] = [];
    const rawKeywords = metadata.keywords;
    if (rawKeywords) {
      if (Array.isArray(rawKeywords)) {
        docKeywords = rawKeywords
          .map(k => typeof k === 'string' ? k : String(k))
          .filter(k => k && k.trim().length > 0);
      } else if (typeof rawKeywords === 'string') {
        try {
          const parsed = JSON.parse(rawKeywords);
          if (Array.isArray(parsed)) {
            docKeywords = parsed
              .map(k => typeof k === 'string' ? k : String(k))
              .filter(k => k && k.trim().length > 0);
          }
        } catch {
          docKeywords = [rawKeywords];
        }
      }
    }
    
    const contentSections = metadata.content_sections as { has_content?: boolean; has_action_tips?: boolean; has_motivation?: boolean; has_followup?: boolean; has_habit_strategy?: boolean } | undefined;

    // DEBUG: Log intent patterns for first few documents
    const topic = metadata.topic as string || 'Unknown';
    const subtopic = metadata.subtopic as string || 'Unknown';
    if (docIntentPatterns.length > 0) {
      console.log(`[KB Retrieval] Document: ${topic} / ${subtopic} - Found ${docIntentPatterns.length} intent patterns`);
      // Check if query matches any intent pattern
      const normalizedQuery = normalizeTextForIntentMatching(userQuery);
      const matchingPatterns = docIntentPatterns.filter(pattern => {
        const normalizedPattern = normalizeTextForIntentMatching(pattern);
        return normalizedQuery === normalizedPattern;
      });
      if (matchingPatterns.length > 0) {
        console.log(`[KB Retrieval] 🎯 EXACT MATCH FOUND! Query: "${userQuery}" matches pattern: "${matchingPatterns[0]}"`);
      }
    } else {
      console.log(`[KB Retrieval] ⚠️  Document: ${topic} / ${subtopic} - NO INTENT PATTERNS`);
    }

    const intentScore = calculateIntentPatternScore(docIntentPatterns, userQuery);
    const keywordScore = queryKeywords.length > 0 
      ? calculateKeywordMatchScore(docKeywords, queryKeywords, userQuery)
      : 0.5;
    const sectionScore = calculateSectionRelevanceScore(contentSections, userQuery);

    // CRITICAL FIX: Detect perfect intent matches and boost them significantly
    // Perfect match = exact match after normalization (not just score >= 1.0)
    const hasPerfectMatch = hasPerfectIntentMatch(docIntentPatterns, userQuery);
    
    // Debug logging for perfect matches
    if (hasPerfectMatch) {
      const topic = doc.metadata?.topic as string || 'Unknown';
      const subtopic = doc.metadata?.subtopic as string || 'Unknown';
      console.log(`[KB Retrieval] ✅ Perfect intent match found! Topic: ${topic}, Subtopic: ${subtopic}, Intent Score: ${intentScore.toFixed(3)}`);
    }
    
    // CRITICAL FIX: Adaptive weighting based on semantic similarity AND intent matches
    // Perfect intent matches should win even if semantic similarity is slightly lower
    // FIX: Treat very high intent scores (>= 0.85) similarly to perfect matches
    // This catches cases like "at night" vs "every night" that normalize differently
    // but have very high semantic overlap
    const isHighIntentMatch = hasPerfectMatch || intentScore >= 0.85;
    
    // Log when high intent matches are found for debugging
    if (isHighIntentMatch && !hasPerfectMatch) {
      const topic = doc.metadata?.topic as string || 'Unknown';
      const subtopic = doc.metadata?.subtopic as string || 'Unknown';
      console.log(`[KB Retrieval] ⚠️ High intent match (not perfect): Score ${intentScore.toFixed(3)} | Query: "${userQuery.substring(0, 50)}" | Topic: ${topic} | Subtopic: ${subtopic}`);
    }
    
    let semanticWeight: number;
    let metadataWeight: number;
    
    if (isHighIntentMatch) {
      // Perfect/high intent match - prioritize metadata VERY heavily (40% semantic, 60% metadata)
      // This ensures exact intent matches win even if semantic similarity is slightly lower
      // Example: Sleep Disturbances with perfect match beats Hot Flashes with higher semantic
      // If semantic similarity is still reasonable (>= 0.5), perfect match should win
      if (semanticScore >= 0.5) {
        semanticWeight = 0.4;
        metadataWeight = 0.6;
      } else {
        // Very low semantic similarity - still boost but less aggressively
        semanticWeight = 0.5;
        metadataWeight = 0.5;
      }
    } else if (semanticScore >= 0.7) {
      // Very high semantic similarity (0.7+) - trust it heavily (85% weight)
      // Example: 0.726 semantic -> 0.726 * 0.85 = 0.617 base, plus metadata boost
      semanticWeight = 0.85;
      metadataWeight = 0.15;
    } else if (semanticScore >= 0.6) {
      // High semantic similarity (0.6-0.7) - strong trust (75% weight)
      semanticWeight = 0.75;
      metadataWeight = 0.25;
    } else {
      // Lower semantic similarity (< 0.6) - use balanced approach (60% weight)
      semanticWeight = 0.6;
      metadataWeight = 0.4;
    }

    // Calculate metadata contribution with boosted intent weight for perfect/high matches
    // Perfect matches get even higher intent weight to ensure they win
    const intentWeight = isHighIntentMatch ? 0.8 : 0.5;
    const keywordWeight = isHighIntentMatch ? 0.15 : 0.35;
    const sectionWeight = isHighIntentMatch ? 0.05 : 0.15;
    
    const metadataScore = 
      (intentScore * intentWeight) +    // Intent patterns are strong signals, boosted for perfect matches
      (keywordScore * keywordWeight) +  // Keywords provide additional relevance
      (sectionScore * sectionWeight);   // Content sections fine-tune relevance

    // Final score: adaptive weighting ensures perfect intent matches win
    let finalScore = 
      (semanticScore * semanticWeight) + 
      (metadataScore * metadataWeight);
    
    // CRITICAL: Add bonus boost for perfect/high matches to ensure they always win
    // This is a safety net to guarantee perfect intent matches rank highest
    // Perfect matches should win even if semantic similarity is lower (e.g., 0.3-0.5)
    if (isHighIntentMatch) {
      // Add a significant boost (0.20-0.30) to ensure perfect matches win
      // Lower semantic scores get bigger boosts to compensate
      let bonus: number;
      if (semanticScore >= 0.5) {
        // Good semantic similarity - moderate boost
        bonus = 0.20 + (semanticScore - 0.5) * 0.2;
      } else if (semanticScore >= 0.4) {
        // Moderate semantic similarity - larger boost needed
        bonus = 0.25 + (semanticScore - 0.4) * 0.5;
      } else if (semanticScore >= 0.3) {
        // Lower semantic similarity but still reasonable - large boost
        bonus = 0.30;
      } else {
        // Very low semantic similarity - maximum boost
        bonus = 0.35;
      }
      finalScore += Math.min(0.35, bonus);
    }

    return {
      doc,
      score: finalScore,
      similarity,
      hasPerfectMatch: isHighIntentMatch, // Use expanded definition for sorting
    };
  });

  // CRITICAL: Sort with perfect matches ALWAYS first, then by score
  // Perfect matches should rank above non-perfect matches regardless of score
  scoredDocs.sort((a, b) => {
    // If one is perfect match and other isn't, perfect match wins
    if (a.hasPerfectMatch && !b.hasPerfectMatch) return -1;
    if (!a.hasPerfectMatch && b.hasPerfectMatch) return 1;
    // Both are same type (both perfect or both not), sort by score
    return b.score - a.score;
  });
  return scoredDocs;
}

/**
 * Check for exact intent pattern matches across ALL personas
 * This ensures exact matches are found regardless of persona classification
 * Returns KBEntry array if exact matches found, empty array otherwise
 */
export async function checkExactIntentMatchAcrossAllPersonas(
  query: string,
  topK: number = 3
): Promise<KBEntry[]> {
  try {
    const supabaseClient = getSupabaseAdmin();
    const normalizedQuery = normalizeTextForIntentMatching(query);
    
    console.log(`[Exact Intent Check] Checking for exact intent pattern matches across ALL personas`);
    
    // Query ALL documents (no persona filter) to check intent patterns
    // Use a reasonable limit to avoid performance issues (300 should cover most cases)
    const { data: allDocs, error: queryError } = await supabaseClient
      .from('documents')
      .select('id, content, metadata')
      .limit(300);
    
    if (queryError || !allDocs || allDocs.length === 0) {
      if (queryError) {
        console.warn(`[Exact Intent Check] Error querying documents: ${queryError.message}`);
      }
      return [];
    }
    
    console.log(`[Exact Intent Check] Checking ${allDocs.length} documents across all personas`);
    
    const exactMatchEntries: KBEntry[] = [];
    
    for (const doc of allDocs) {
      const metadata = doc.metadata as any;
      
      if (!metadata) {
        continue;
      }
      
      // Handle intent_patterns - can be array or string
      let intentPatterns: string[] = [];
      const rawIntentPatterns = metadata.intent_patterns;
      
      if (rawIntentPatterns) {
        if (Array.isArray(rawIntentPatterns)) {
          intentPatterns = rawIntentPatterns
            .map((p: any) => typeof p === 'string' ? p : String(p))
            .filter((p: string) => p && p.trim().length > 0);
        } else if (typeof rawIntentPatterns === 'string') {
          intentPatterns = [rawIntentPatterns];
        }
      }
      
      if (intentPatterns.length === 0) {
        continue; // Skip documents without intent patterns
      }
      
      // Check for exact match after normalization
      for (const pattern of intentPatterns) {
        const patternNormalized = normalizeTextForIntentMatching(pattern);
        
        if (normalizedQuery === patternNormalized) {
          console.log(`[Exact Intent Check] ✅ FOUND EXACT INTENT MATCH across all personas: "${pattern}" | Persona: ${metadata.persona} | Topic: ${metadata.topic} | Subtopic: ${metadata.subtopic}`);
          
          // Convert content_sections
          const rawContentSections = metadata.content_sections as Partial<ContentSections> | undefined;
          const contentSections: ContentSections = {
            has_content: rawContentSections?.has_content ?? false,
            has_action_tips: rawContentSections?.has_action_tips ?? false,
            has_motivation: rawContentSections?.has_motivation ?? false,
            has_followup: rawContentSections?.has_followup ?? false,
            has_habit_strategy: rawContentSections?.has_habit_strategy ?? false,
          };
          
          // Convert to KBEntry format
          const kbEntry: KBEntry = {
            id: doc.id || '',
            content: doc.content,
            metadata: {
              persona: metadata.persona || '',
              topic: metadata.topic || '',
              subtopic: metadata.subtopic || '',
              keywords: metadata.keywords || [],
              intent_patterns: intentPatterns,
              content_sections: contentSections,
              follow_up_links: metadata.follow_up_links as any,
              source: metadata.source,
              section_index: metadata.section_index,
            },
            similarity: 1.0, // Exact match gets highest similarity
            semanticSimilarity: 1.0,
          };
          
          exactMatchEntries.push(kbEntry);
          break; // Only add each document once (even if multiple patterns match)
        }
      }
    }
    
    if (exactMatchEntries.length > 0) {
      console.log(`[Exact Intent Check] ✅ Found ${exactMatchEntries.length} exact intent pattern match(es) across all personas`);
    }
    
    return exactMatchEntries.slice(0, topK);
  } catch (error) {
    console.error('[Exact Intent Check] Error checking exact intent matches:', error);
    return [];
  }
}

/**
 * Strict Intent-Based Retrieval for kb_strict mode
 * Retrieves documents ONLY if their intents match the user query (score >= 0.80)
 * Returns empty result if no intent matches found (routes to LLM instead of semantic fallback)
 */
export async function retrieveFromKBByIntentOnly(
  query: string,
  persona: Persona,
  topK: number = 5,
  intentThreshold: number = 0.80
): Promise<RetrievalResult> {
  try {
    console.log(`[Intent-Only Retrieval] Starting strict intent-based retrieval for: "${query}"`);
    console.log(`[Intent-Only Retrieval] Intent threshold: ${intentThreshold}`);
    
    // CRITICAL FIX: First, check for exact intent pattern matches via direct DB query
    // This ensures exact matches are found even if semantic similarity is very low
    const supabaseClient = getSupabaseAdmin();
    const normalizedQuery = normalizeTextForIntentMatching(query);
    const metadataPersona = mapPersonaToMetadata(persona);
    
    console.log(`[Intent-Only Retrieval] Checking for exact intent pattern matches in persona: ${metadataPersona}`);
    
    // Query all documents with this persona to check intent patterns
    // Use a reasonable limit to avoid performance issues (200 should cover most cases)
    const { data: personaDocs, error: personaError } = await supabaseClient
      .from('documents')
      .select('id, content, metadata')
      .eq('metadata->>persona', metadataPersona)
      .limit(200);
    
    if (!personaError && personaDocs && personaDocs.length > 0) {
      console.log(`[Intent-Only Retrieval] Checking ${personaDocs.length} documents for exact intent pattern matches`);
      
      const exactMatchEntries: KBEntry[] = [];
      
      for (const doc of personaDocs) {
        // Supabase returns JSONB fields as parsed objects, so doc.metadata is already an object
        const metadata = doc.metadata as any;
        
        if (!metadata) {
          console.warn(`[Intent-Only Retrieval] Document ${doc.id} has no metadata, skipping`);
          continue;
        }
        
        // Handle intent_patterns - can be array or string
        let intentPatterns: string[] = [];
        const rawIntentPatterns = metadata.intent_patterns;
        
        if (rawIntentPatterns) {
          if (Array.isArray(rawIntentPatterns)) {
            intentPatterns = rawIntentPatterns
              .map((p: any) => typeof p === 'string' ? p : String(p))
              .filter((p: string) => p && p.trim().length > 0);
          } else if (typeof rawIntentPatterns === 'string') {
            intentPatterns = [rawIntentPatterns];
          }
        }
        
        if (intentPatterns.length === 0) {
          continue; // Skip documents without intent patterns
        }
        
        // Check for exact match after normalization
        for (const pattern of intentPatterns) {
          const patternNormalized = normalizeTextForIntentMatching(pattern);
          
          if (normalizedQuery === patternNormalized) {
            console.log(`[Intent-Only Retrieval] ✅ FOUND EXACT INTENT MATCH via direct DB query: "${pattern}" | Topic: ${metadata.topic} | Subtopic: ${metadata.subtopic}`);
            
            // Convert content_sections
            const rawContentSections = metadata.content_sections as Partial<ContentSections> | undefined;
            const contentSections: ContentSections = {
              has_content: rawContentSections?.has_content ?? false,
              has_action_tips: rawContentSections?.has_action_tips ?? false,
              has_motivation: rawContentSections?.has_motivation ?? false,
              has_followup: rawContentSections?.has_followup ?? false,
              has_habit_strategy: rawContentSections?.has_habit_strategy ?? false,
            };
            
            // Convert to KBEntry format
            const kbEntry: KBEntry = {
              id: doc.id || '',
              content: doc.content,
              metadata: {
                persona: metadataPersona,
                topic: metadata.topic || '',
                subtopic: metadata.subtopic || '',
                keywords: metadata.keywords || [],
                intent_patterns: intentPatterns,
                content_sections: contentSections,
                follow_up_links: metadata.follow_up_links as any,
                source: metadata.source,
                section_index: metadata.section_index,
              },
              similarity: 1.0, // Exact match gets highest similarity
              semanticSimilarity: 1.0,
            };
            
            exactMatchEntries.push(kbEntry);
            break; // Only add each document once (even if multiple patterns match)
          }
        }
      }
      
      // If exact matches found, return them immediately (prioritize exact matches)
      if (exactMatchEntries.length > 0) {
        console.log(`[Intent-Only Retrieval] ✅ Returning ${exactMatchEntries.length} exact intent pattern match(es) - bypassing semantic retrieval`);
        return {
          kbEntries: exactMatchEntries.slice(0, topK),
          hasMatch: true,
          topScore: 1.0,
          topSemanticScore: 1.0,
        };
      } else {
        console.log(`[Intent-Only Retrieval] No exact intent pattern matches found, proceeding with semantic retrieval`);
      }
    } else if (personaError) {
      console.warn(`[Intent-Only Retrieval] Error querying documents for exact matches: ${personaError.message}, proceeding with semantic retrieval`);
    }
    
    // If no exact matches found, proceed with semantic retrieval + intent filtering
    // First, get semantic similarity candidates (to build candidate pool)
    const semanticResult = await retrieveFromKB(query, persona, Math.min(topK * 5, 30), 0.3);
    
    if (!semanticResult.hasMatch || semanticResult.kbEntries.length === 0) {
      console.log(`[Intent-Only Retrieval] No semantic candidates found, returning empty result`);
      return {
        kbEntries: [],
        hasMatch: false,
      };
    }
    
    console.log(`[Intent-Only Retrieval] Found ${semanticResult.kbEntries.length} semantic candidates`);
    
    // Filter candidates by intent match score >= threshold
    const intentMatchedEntries: KBEntry[] = [];
    const excludedEntries: Array<{ entry: KBEntry; intentScore: number }> = [];
    
    for (const entry of semanticResult.kbEntries) {
      const intentPatterns = entry.metadata.intent_patterns || [];
      
      if (intentPatterns.length === 0) {
        // No intent patterns - exclude
        excludedEntries.push({ entry, intentScore: 0 });
        continue;
      }
      
      // Calculate intent match score
      const intentScore = calculateIntentPatternScore(intentPatterns, query);
      
      // Check for exact matches for better logging
      const queryNormalized = normalizeTextForIntentMatching(query);
      const exactMatches = intentPatterns.filter(pattern => {
        const patternNormalized = normalizeTextForIntentMatching(pattern);
        return queryNormalized === patternNormalized;
      });
      
      if (intentScore >= intentThreshold) {
        // Intent match found - include
        intentMatchedEntries.push(entry);
        if (exactMatches.length > 0) {
          console.log(`[Intent-Only Retrieval] ✅ EXACT INTENT MATCH: Score ${intentScore.toFixed(3)} >= ${intentThreshold} | Pattern: "${exactMatches[0]}" | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
        } else {
          console.log(`[Intent-Only Retrieval] ✅ Intent match: Score ${intentScore.toFixed(3)} >= ${intentThreshold} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
        }
      } else {
        // Intent score too low - exclude
        excludedEntries.push({ entry, intentScore });
        // Log top intent patterns for debugging
        const topPatterns = intentPatterns.slice(0, 3);
        console.log(`[Intent-Only Retrieval] ❌ Intent mismatch: Score ${intentScore.toFixed(3)} < ${intentThreshold} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
        if (topPatterns.length > 0) {
          console.log(`[Intent-Only Retrieval]   Top intent patterns: ${topPatterns.map(p => `"${p}"`).join(', ')}`);
        }
      }
    }
    
    // Determine result: use intent matches if found, otherwise return empty (route to LLM)
    let finalEntries: KBEntry[];
    
    if (intentMatchedEntries.length > 0) {
      // Sort intent-matched entries by intent score (descending) - perfect matches first
      // This ensures documents with exact intent matches rank above those with lower intent scores
      const entriesWithScores = intentMatchedEntries.map(entry => {
        const intentPatterns = entry.metadata.intent_patterns || [];
        const intentScore = calculateIntentPatternScore(intentPatterns, query);
        return { entry, intentScore };
      });
      
      // Sort by intent score (descending), then by semantic similarity as tiebreaker
      entriesWithScores.sort((a, b) => {
        // First sort by intent score (higher is better)
        if (Math.abs(a.intentScore - b.intentScore) > 0.01) {
          return b.intentScore - a.intentScore;
        }
        // If intent scores are very close, use semantic similarity as tiebreaker
        const aSemantic = a.entry.semanticSimilarity || 0;
        const bSemantic = b.entry.semanticSimilarity || 0;
        return bSemantic - aSemantic;
      });
      
      finalEntries = entriesWithScores.map(({ entry }) => entry).slice(0, topK);
      
      console.log(`[Intent-Only Retrieval] ✅ Using ${finalEntries.length} intent-matched documents (sorted by intent score)`);
      console.log(`[Intent-Only Retrieval] Excluded ${excludedEntries.length} documents with low intent scores`);
      
      // Log the sorted order
      if (finalEntries.length > 0) {
        console.log(`[Intent-Only Retrieval] Sorted intent matches:`);
        entriesWithScores.slice(0, finalEntries.length).forEach(({ entry, intentScore }, idx) => {
          const semanticScore = entry.semanticSimilarity || 0;
          console.log(`  [${idx + 1}] Intent: ${intentScore.toFixed(3)} | Semantic: ${semanticScore.toFixed(3)} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
        });
      }
    } else {
      // No intent matches - return empty (strict mode requires intent match, route to LLM)
      console.log(`[Intent-Only Retrieval] ⚠️  No intent matches found (all ${excludedEntries.length} candidates excluded)`);
      console.log(`[Intent-Only Retrieval] ❌ Returning empty result - routing to LLM (strict mode requires intent match >= ${intentThreshold})`);
      
      // Log why entries were excluded for debugging
      if (excludedEntries.length > 0) {
        console.log(`[Intent-Only Retrieval] Top excluded entries (intent scores below threshold):`);
        excludedEntries
          .sort((a, b) => b.intentScore - a.intentScore)
          .slice(0, 3)
          .forEach(({ entry, intentScore }, idx) => {
            console.log(`  [${idx + 1}] Intent: ${intentScore.toFixed(3)} < ${intentThreshold} | Topic: ${entry.metadata.topic} | Subtopic: ${entry.metadata.subtopic}`);
          });
      }
      
      // Return empty result - this will trigger LLM routing in orchestrator
      return {
        kbEntries: [],
        hasMatch: false,
      };
    }
    
    return {
      kbEntries: finalEntries,
      hasMatch: finalEntries.length > 0,
      topScore: finalEntries[0]?.similarity,
      topSemanticScore: finalEntries[0]?.semanticSimilarity,
    };
  } catch (error) {
    console.error("[Intent-Only Retrieval] Error:", error);
    return {
      kbEntries: [],
      hasMatch: false,
    };
  }
}

/**
 * Map persona to metadata persona value
 * Current KB uses "menopause" but we classify as "menopause_specialist"
 */
function mapPersonaToMetadata(persona: Persona): string {
  if (persona === "menopause_specialist") {
    return "menopause"; // Current KB uses "menopause" in metadata
  }
  return persona; // Other personas match directly
}

/**
 * Calculate adaptive hybrid threshold based on top semantic score
 * When semantic scores are high, we trust them more and lower hybrid threshold requirement
 * This prevents good semantic matches from being rejected due to metadata scoring
 */
function calculateAdaptiveHybridThreshold(
  topSemanticScore: number,
  baseHybridThreshold: number
): number {
  if (topSemanticScore >= 0.58) {
    // Very high semantic similarity (0.58+) - trust it heavily, lower hybrid requirement significantly
    return Math.max(0.44, baseHybridThreshold - 0.10);
  } else if (topSemanticScore >= 0.54) {
    // High semantic similarity (0.54-0.58) - lower hybrid requirement
    // This catches cases like semantic 0.541 with hybrid 0.456
    return Math.max(0.45, baseHybridThreshold - 0.08);
  } else if (topSemanticScore >= 0.52) {
    // Good semantic similarity (0.52-0.54) - slightly lower hybrid requirement
    return Math.max(0.47, baseHybridThreshold - 0.05);
  }
  // Default: use base threshold
  return baseHybridThreshold;
}

/**
 * Retrieve KB entries with OPTIMIZED database-level filtering and actual similarity scores
 * 
 * IMPROVEMENTS:
 * 1. Direct database query with ACTUAL similarity scores (not position-based approximation)
 * 2. Database-level persona filtering (not post-filtering in JavaScript) - MUCH FASTER
 * 3. Query normalization and expansion for better matching
 * 4. Uses real similarity scores in hybrid re-ranking
 */
export async function retrieveFromKB(
  query: string,
  persona: Persona,
  topK: number = 5,
  similarityThreshold: number = 0.5
): Promise<RetrievalResult> {
  try {
    const supabaseClient = getSupabaseAdmin();
    
    // Early exit if no documents
    const { count } = await supabaseClient
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (!count || count === 0) {
      return {
        kbEntries: [],
        hasMatch: false,
      };
    }

    // Normalize and expand query for better matching
    const normalizedQuery = normalizeAndExpandQuery(query);
    
    // Generate embedding for the query
    const queryEmbedding = await embeddings.embedQuery(normalizedQuery);
    
    // Map persona to metadata value
    const metadataPersona = mapPersonaToMetadata(persona);
    
    // CRITICAL FIX: Retrieve significantly more candidates to ensure perfect intent matches are included
    // Even if semantic similarity is lower, documents with perfect intent matches must be in the candidate pool
    // Example: "why do i wake up every night" should retrieve Sleep Disturbances even if Hot Flashes has higher semantic similarity
    // Increased to 5x topK (15-30 candidates) to ensure intent-matched documents are included
    const retrieveCount = Math.min(Math.ceil(topK * 5), 30);
    
    // For hybrid mode personas (nutrition_coach, exercise_trainer), include "menopause" content too
    // Weight/metabolism questions are relevant to both the specific persona AND menopause content
    // For kb_strict mode (menopause_specialist), use strict persona filtering
    const isHybridModePersona = persona === "nutrition_coach" || persona === "exercise_trainer";
    
    // OPTIMIZATION: Use database-level persona filtering via RPC call
    // This filters at the database level using indexes, MUCH faster than JavaScript filtering
    // For hybrid mode, don't filter by persona to include both persona-specific and menopause content
    const { data: matches, error } = await supabaseClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: retrieveCount,
      filter: isHybridModePersona ? {} : { persona: metadataPersona } // No filter for hybrid mode, strict filter for kb_strict
    });

    if (error) {
      console.error("Error calling match_documents with persona filter:", error);
      // Fallback: try without persona filter if database filter fails
      const { data: fallbackMatches, error: fallbackError } = await supabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: retrieveCount,
        filter: {}
      });
      
      if (fallbackError || !fallbackMatches || fallbackMatches.length === 0) {
        return {
          kbEntries: [],
          hasMatch: false,
        };
      }
      
      // Post-filter by persona if database filter failed (fallback only)
      // For hybrid mode, don't filter - include all matches
      const personaFiltered = isHybridModePersona 
        ? fallbackMatches 
        : fallbackMatches.filter((m: MatchResult) => 
            m.metadata?.persona === metadataPersona
          );
      
      if (personaFiltered.length === 0) {
        return {
          kbEntries: [],
          hasMatch: false,
        };
      }
      
      // Convert to Document format with ACTUAL similarity scores from database
      const documentsWithScores = personaFiltered.map((match: MatchResult) => {
        // DEBUG: Log metadata structure from database (fallback path)
        const topic = match.metadata?.topic as string || 'Unknown';
        const intentPatterns = match.metadata?.intent_patterns;
        const intentPatternsType = typeof intentPatterns;
        const intentPatternsIsArray = Array.isArray(intentPatterns);
        
        if (topic.includes('Sleep') || topic.includes('Hot Flash')) {
          console.log(`[KB Retrieval] 🔍 Database metadata (fallback) for ${topic}:`);
          console.log(`  - intent_patterns type: ${intentPatternsType}`);
          console.log(`  - intent_patterns is array: ${intentPatternsIsArray}`);
          console.log(`  - intent_patterns value:`, intentPatterns);
          if (Array.isArray(intentPatterns) && intentPatterns.length > 0) {
            console.log(`  - First intent pattern: "${intentPatterns[0]}"`);
          }
        }
        
        return {
          doc: {
            pageContent: match.content,
            metadata: match.metadata,
          } as Document,
          similarity: match.similarity, // ACTUAL similarity score
        };
      });
      
      // Apply hybrid search re-ranking with actual similarity scores
      const scoredDocs = applyHybridSearch(documentsWithScores, query);
      
      // Log scoring details for debugging (fallback path)
      if (scoredDocs.length > 0) {
        console.log(`[KB Retrieval] Scoring results (fallback path, before threshold filter):`);
      scoredDocs.slice(0, 5).forEach((item, idx) => {
        const doc = item.doc;
        const topic = doc.metadata?.topic as string || 'Unknown';
        const subtopic = doc.metadata?.subtopic as string || 'Unknown';
        const perfectMarker = item.hasPerfectMatch ? ' ⭐ PERFECT MATCH' : '';
        console.log(`  [${idx + 1}] Final Score: ${item.score.toFixed(3)} | Semantic: ${item.similarity.toFixed(3)} | Topic: ${topic} | Subtopic: ${subtopic}${perfectMarker}`);
      });
      }
      
      // IMPROVED: Use semantic similarity as primary gate, hybrid score for ranking
      // Allow lower semantic threshold (0.35-0.4) for better recall, especially for paraphrases
      // CRITICAL: Perfect intent matches bypass semantic threshold - they must be included
      const semanticThreshold = Math.max(0.35, similarityThreshold - 0.1);
      
      // Separate perfect matches from regular matches
      const perfectMatches: typeof scoredDocs = [];
      const regularMatches: typeof scoredDocs = [];
      
      for (const item of scoredDocs) {
        // Use the hasPerfectMatch flag from scoring (more reliable)
        if (item.hasPerfectMatch) {
          perfectMatches.push(item);
        } else {
          regularMatches.push(item);
        }
      }
      
      // Regular matches must pass semantic threshold
      const semanticallyValid = regularMatches.filter(item => item.similarity >= semanticThreshold);
      
      // Perfect matches bypass semantic threshold - always include them (even if semantic is lower)
      // Perfect matches also get a lower hybrid threshold (0.1 lower) to ensure they're not filtered out
      const adaptiveHybridThreshold = calculateAdaptiveHybridThreshold(scoredDocs.length > 0 ? scoredDocs[0].similarity : 0, similarityThreshold);
      const perfectHybridThreshold = Math.max(0.3, adaptiveHybridThreshold - 0.1); // Lower threshold for perfect matches
      const filteredRegular = semanticallyValid.filter(item => item.score >= adaptiveHybridThreshold);
      const filteredPerfect = perfectMatches.filter(item => item.score >= perfectHybridThreshold);
      
      // Combine: perfect matches first (they should rank highest), then regular matches
      // Sort perfect matches by score (descending) to ensure best perfect match is first
      const sortedPerfect = filteredPerfect.sort((a, b) => b.score - a.score);
      const sortedRegular = filteredRegular.sort((a, b) => b.score - a.score);
      const filteredDocs = [...sortedPerfect, ...sortedRegular];
      
      if (scoredDocs.length > 0) {
        const topSemantic = scoredDocs[0].similarity;
        const topHybrid = scoredDocs[0].score;
        console.log(`[KB Retrieval] Threshold filtering (fallback path):`);
        console.log(`  - Semantic threshold: ${semanticThreshold.toFixed(3)} (primary gate)`);
        console.log(`  - Hybrid threshold: ${adaptiveHybridThreshold.toFixed(3)} (adaptive, base: ${similarityThreshold.toFixed(3)})`);
        console.log(`  - Top semantic score: ${topSemantic.toFixed(3)}`);
        console.log(`  - Top hybrid score: ${topHybrid.toFixed(3)}`);
        console.log(`  - Perfect matches: ${perfectMatches.length} (bypass semantic threshold)`);
        console.log(`  - Regular matches (semantically valid): ${semanticallyValid.length}/${regularMatches.length}`);
        console.log(`  - Passed both thresholds: ${filteredDocs.length}/${scoredDocs.length} (${filteredPerfect.length} perfect + ${filteredRegular.length} regular)`);
        
        if (filteredPerfect.length > 0) {
          console.log(`[KB Retrieval] ⭐ Perfect intent matches found and included: ${filteredPerfect.length}`);
        }
      }

      // Convert to KBEntry format with both scores
      const kbEntries: KBEntry[] = filteredDocs.slice(0, topK).map(({ doc, score, similarity }) => {
        const rawContentSections = doc.metadata?.content_sections as Partial<ContentSections> | undefined;
        const contentSections: ContentSections = {
          has_content: rawContentSections?.has_content ?? false,
          has_action_tips: rawContentSections?.has_action_tips ?? false,
          has_motivation: rawContentSections?.has_motivation ?? false,
          has_followup: rawContentSections?.has_followup ?? false,
          has_habit_strategy: rawContentSections?.has_habit_strategy ?? false,
        };

        return {
          id: (doc.metadata?.id as string) || '',
          content: doc.pageContent,
          metadata: {
            persona: (doc.metadata?.persona as string) || '',
            topic: (doc.metadata?.topic as string) || '',
            subtopic: (doc.metadata?.subtopic as string) || '',
            keywords: (doc.metadata?.keywords as string[]) || [],
            intent_patterns: (doc.metadata?.intent_patterns as string[]) || [],
            content_sections: contentSections,
            follow_up_links: (doc.metadata?.follow_up_links as import("./types").FollowUpLink[]) || undefined,
            source: doc.metadata?.source as string,
            section_index: doc.metadata?.section_index as number,
          },
          similarity: score, // Hybrid score
          semanticSimilarity: similarity, // Semantic score
        };
      });

      return {
        kbEntries,
        hasMatch: kbEntries.length > 0,
        topScore: kbEntries[0]?.similarity,
        topSemanticScore: kbEntries[0]?.semanticSimilarity,
      };
    }

    if (!matches || matches.length === 0) {
      return {
        kbEntries: [],
        hasMatch: false,
      };
    }

    // Convert to Document format with ACTUAL similarity scores from database
    const documentsWithScores = matches.map((match: MatchResult) => {
      // DEBUG: Log metadata structure from database
      const topic = match.metadata?.topic as string || 'Unknown';
      const intentPatterns = match.metadata?.intent_patterns;
      const intentPatternsType = typeof intentPatterns;
      const intentPatternsIsArray = Array.isArray(intentPatterns);
      
      if (topic.includes('Sleep') || topic.includes('Hot Flash')) {
        console.log(`[KB Retrieval] 🔍 Database metadata for ${topic}:`);
        console.log(`  - intent_patterns type: ${intentPatternsType}`);
        console.log(`  - intent_patterns is array: ${intentPatternsIsArray}`);
        console.log(`  - intent_patterns value:`, intentPatterns);
        if (Array.isArray(intentPatterns) && intentPatterns.length > 0) {
          console.log(`  - First intent pattern: "${intentPatterns[0]}"`);
        }
      }
      
      return {
        doc: {
          pageContent: match.content,
          metadata: match.metadata,
        } as Document,
        similarity: match.similarity, // ACTUAL similarity score from database
      };
    });

    // Apply hybrid search re-ranking with actual similarity scores
    const scoredDocs = applyHybridSearch(documentsWithScores, query);

    // Log scoring details for debugging
    if (scoredDocs.length > 0) {
      console.log(`[KB Retrieval] Scoring results (before threshold filter):`);
      scoredDocs.slice(0, 5).forEach((item, idx) => {
        const doc = item.doc;
        const topic = doc.metadata?.topic as string || 'Unknown';
        const subtopic = doc.metadata?.subtopic as string || 'Unknown';
        const perfectMarker = item.hasPerfectMatch ? ' ⭐ PERFECT MATCH' : '';
        console.log(`  [${idx + 1}] Final Score: ${item.score.toFixed(3)} | Semantic: ${item.similarity.toFixed(3)} | Topic: ${topic} | Subtopic: ${subtopic}${perfectMarker}`);
      });
      console.log(`[KB Retrieval] Threshold: ${similarityThreshold}`);
    }

    // IMPROVED: Use semantic similarity as primary gate, hybrid score for ranking
    // This ensures high-quality semantic matches aren't rejected due to metadata scoring
    // Allow lower semantic threshold (0.35-0.4) for better recall, especially for paraphrases
    // CRITICAL: Perfect intent matches bypass semantic threshold - they must be included
    const semanticThreshold = Math.max(0.35, similarityThreshold - 0.1);
    
    // Separate perfect matches from regular matches
    const perfectMatches: typeof scoredDocs = [];
    const regularMatches: typeof scoredDocs = [];
    
    for (const item of scoredDocs) {
      // Use the hasPerfectMatch flag from scoring (more reliable)
      if (item.hasPerfectMatch) {
        perfectMatches.push(item);
      } else {
        regularMatches.push(item);
      }
    }
    
    // Regular matches must pass semantic threshold
    const semanticallyValid = regularMatches.filter(item => item.similarity >= semanticThreshold);
    
    // Perfect matches bypass semantic threshold - always include them (even if semantic is lower)
    // But still apply hybrid threshold to ensure quality
    const topSemanticScore = scoredDocs.length > 0 ? scoredDocs[0].similarity : 0;
    const adaptiveHybridThreshold = calculateAdaptiveHybridThreshold(topSemanticScore, similarityThreshold);
    const filteredRegular = semanticallyValid.filter(item => item.score >= adaptiveHybridThreshold);
    // Perfect matches get a lower hybrid threshold (0.1 lower) to ensure they're not filtered out
    const perfectHybridThreshold = Math.max(0.3, adaptiveHybridThreshold - 0.1);
    const filteredPerfect = perfectMatches.filter(item => item.score >= perfectHybridThreshold);
    
    // Combine: perfect matches first (they should rank highest), then regular matches
    // Sort perfect matches by score (descending) to ensure best perfect match is first
    const sortedPerfect = filteredPerfect.sort((a, b) => b.score - a.score);
    const sortedRegular = filteredRegular.sort((a, b) => b.score - a.score);
    const filteredDocs = [...sortedPerfect, ...sortedRegular];

    // Enhanced logging
    if (scoredDocs.length > 0) {
      const topSemantic = scoredDocs[0].similarity;
      const topHybrid = scoredDocs[0].score;
      console.log(`[KB Retrieval] Threshold filtering:`);
      console.log(`  - Semantic threshold: ${semanticThreshold.toFixed(3)} (primary gate)`);
      console.log(`  - Hybrid threshold: ${adaptiveHybridThreshold.toFixed(3)} (adaptive, base: ${similarityThreshold.toFixed(3)})`);
      console.log(`  - Top semantic score: ${topSemantic.toFixed(3)}`);
      console.log(`  - Top hybrid score: ${topHybrid.toFixed(3)}`);
      console.log(`  - Perfect matches: ${perfectMatches.length} (bypass semantic threshold)`);
      console.log(`  - Regular matches (semantically valid): ${semanticallyValid.length}/${regularMatches.length}`);
      console.log(`  - Passed both thresholds: ${filteredDocs.length}/${scoredDocs.length} (${filteredPerfect.length} perfect + ${filteredRegular.length} regular)`);
      
      if (filteredDocs.length === 0 && semanticallyValid.length > 0) {
        console.log(`[KB Retrieval] ⚠️  Semantic match found but hybrid score too low`);
        console.log(`  - Top semantic: ${topSemantic.toFixed(3)} (passed)`);
        console.log(`  - Top hybrid: ${topHybrid.toFixed(3)} (failed threshold ${adaptiveHybridThreshold.toFixed(3)})`);
      }
      
      if (filteredPerfect.length > 0) {
        console.log(`[KB Retrieval] ⭐ Perfect intent matches found and included: ${filteredPerfect.length}`);
      }
    }

    // Convert to KBEntry format with both scores
    const kbEntries: KBEntry[] = filteredDocs.slice(0, topK).map(({ doc, score, similarity }) => {
      const rawContentSections = doc.metadata?.content_sections as Partial<ContentSections> | undefined;
      const contentSections: ContentSections = {
        has_content: rawContentSections?.has_content ?? false,
        has_action_tips: rawContentSections?.has_action_tips ?? false,
        has_motivation: rawContentSections?.has_motivation ?? false,
        has_followup: rawContentSections?.has_followup ?? false,
        has_habit_strategy: rawContentSections?.has_habit_strategy ?? false,
      };

      return {
        id: (doc.metadata?.id as string) || '',
        content: doc.pageContent,
        metadata: {
          persona: (doc.metadata?.persona as string) || '',
          topic: (doc.metadata?.topic as string) || '',
          subtopic: (doc.metadata?.subtopic as string) || '',
          keywords: (doc.metadata?.keywords as string[]) || [],
          intent_patterns: (doc.metadata?.intent_patterns as string[]) || [],
          content_sections: contentSections,
          follow_up_links: (doc.metadata?.follow_up_links as import("./types").FollowUpLink[]) || undefined,
          source: doc.metadata?.source as string,
          section_index: doc.metadata?.section_index as number,
        },
        similarity: score, // Hybrid score for ranking
        semanticSimilarity: similarity, // Raw semantic similarity for threshold gating
      };
    });

    return {
      kbEntries,
      hasMatch: kbEntries.length > 0,
      topScore: kbEntries[0]?.similarity, // Hybrid score
      topSemanticScore: kbEntries[0]?.semanticSimilarity, // Semantic score
    };
  } catch (error) {
    console.error("Error retrieving from KB:", error);
    return {
      kbEntries: [],
      hasMatch: false,
    };
  }
}
