/**
 * Document Ingestion Script for LangChain RAG
 * 
 * This script loads knowledge base documents and ingests them into Supabase
 * for vector search. Each section becomes ONE document (one complete answer).
 * 
 * Optimizations:
 * - Intents and keywords are included in content column for better vector search
 * - Each section = 1 document (no chunking unless extremely large)
 * - Metadata preserved for re-ranking (intents, keywords, content_sections)
 * - Intent patterns are repeated at the start for maximum semantic matching accuracy
 * 
 * Supports both YAML frontmatter and Markdown formats.
 * 
 * Usage:
 *   npx tsx scripts/ingest-documents.ts
 * 
 * Note: Database is always cleared before ingestion to ensure clean state.
 */

// Load environment variables from .env.local or .env
import { config } from 'dotenv';
import { resolve } from 'path';

// Try to load .env.local first, then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from "@supabase/supabase-js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { Document } from "@langchain/core/documents";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize embeddings - using text-embedding-3-large with dimension reduction
// Upgraded from text-embedding-3-small for better semantic understanding and retrieval accuracy
// Reduced to 1536 dimensions to fit Supabase's 2000-dim limit while maintaining better quality than small model
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-large",
  dimensions: 1536, // Reduced from 3072 to fit database limit, but still better than text-embedding-3-small
});

import fs from 'fs';
import path from 'path';

interface SectionMetadata {
  persona: string;
  topic: string;
  subtopic: string;
}

interface ContentSections {
  has_content: boolean;
  has_action_tips: boolean;
  has_motivation: boolean;
  has_followup: boolean;
  has_habit_strategy: boolean;
}

interface FollowUpLink {
  persona: string;
  topic: string;
  subtopic: string;
  label: string;
}

interface ParsedSection {
  metadata: SectionMetadata;
  content: string;
  intent_patterns: string[];
  keywords: string[];
  content_sections: ContentSections;
  follow_up_links?: FollowUpLink[];
}

type FileFormat = 'yaml' | 'markdown';

/**
 * Detect file format based on content
 */
function detectFormat(content: string): FileFormat {
  const trimmed = content.trim();
  
  // YAML format: has YAML-style key-value pairs (persona:, topic:, content_text:)
  // Can start with --- or directly with persona:
  const hasYAMLMarkers = trimmed.includes('persona:') && 
                         trimmed.includes('topic:') && 
                         trimmed.includes('content_text:');
  
  // Markdown format: has ## headings and **Persona:** format
  const hasMarkdownMarkers = trimmed.includes('##') && trimmed.includes('**Persona:**');
  
  if (hasYAMLMarkers) {
    return 'yaml';
  }
  if (hasMarkdownMarkers) {
    return 'markdown';
  }
  
  // Default to markdown for backward compatibility
  return 'markdown';
}

/**
 * Parse YAML frontmatter sections
 * Handles files that start with --- or directly with persona:
 * - If file starts with ---, first split result is empty (filtered out), second is first section
 * - If file doesn't start with ---, first split result is the first section (everything before first ---)
 */
function parseYAMLSections(content: string): string[] {
  const sections: string[] = [];
  
  // Handle files that start with --- by removing leading separator
  let normalizedContent = content.trim();
  if (normalizedContent.startsWith('---')) {
    normalizedContent = normalizedContent.replace(/^---\s*\n?/m, '');
  }
  
  // Split by --- separators (handle variations: --- with trailing whitespace, multiple --- lines)
  // Use a more robust split that handles blank lines between separators
  const parts = normalizedContent.split(/^---\s*$/gm);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const trimmed = part.trim();
    
    // Skip empty parts (blank lines between --- separators)
    if (!trimmed || trimmed.length === 0) {
      continue;
    }
    
    // Check for required fields at top level (not indented)
    // Use regex to ensure they're at the start of a line (not indented)
    const hasPersona = /^persona:/m.test(trimmed);
    const hasTopic = /^topic:/m.test(trimmed);
    const hasSubtopic = /^subtopic:/m.test(trimmed);
    
    // Verify all three required fields exist at top level
    if (hasPersona && hasTopic && hasSubtopic) {
      sections.push(trimmed);
    } else {
      // Log when a part doesn't have all required fields at top level (for debugging)
      // This helps identify if sections are being incorrectly split or have formatting issues
      if (hasPersona || hasTopic || hasSubtopic) {
        console.warn(`   ⚠️  [Part ${i + 1}] Skipping section: missing required fields at top level (persona: ${hasPersona}, topic: ${hasTopic}, subtopic: ${hasSubtopic})`);
        // Log first few lines to help debug
        const firstLines = trimmed.split('\n').slice(0, 5).join(' | ');
        console.warn(`      First lines: ${firstLines.substring(0, 100)}...`);
      }
    }
  }
  
  return sections;
}

/**
 * Parse markdown file into sections based on ### subtopic headings followed by metadata
 * Handles cases where:
 * 1. Multiple sections share the same ## topic heading (split on ### subtopic headings)
 * 2. ## headings may have leading whitespace
 * 3. Sections are defined by ### subtopic headings followed by metadata (Persona, Topic, Subtopic)
 */
function parseMarkdownSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection: string[] = [];
  let lastTopicHeading: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track the most recent ## topic heading (with or without leading whitespace)
    // Don't add it to current section yet - wait for ### subtopic heading
    if (line.match(/^\s*##\s+/)) {
      lastTopicHeading = line;
      // Don't add to current section - we'll add it when we start the new section
      continue;
    }
    
    // Check if this is a ### subtopic heading
    const isSubtopicHeading = trimmed.match(/^###\s+/);
    
    if (isSubtopicHeading) {
      // Check if this ### heading is followed by metadata (Persona, Topic, Subtopic)
      // Look ahead a few lines to see if metadata follows
      let isFollowedByMetadata = false;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.includes('**Persona:**') || 
            nextLine.includes('**Topic:**') || 
            nextLine.includes('**Subtopic:**')) {
          isFollowedByMetadata = true;
          break;
        }
        // Stop if we hit another heading
        if (nextLine.match(/^#{1,3}\s+/)) {
          break;
        }
      }
      
      // If this ### heading is followed by metadata, it's a new section
      if (isFollowedByMetadata) {
        // Save previous section if it exists
        if (currentSection.length > 0) {
          sections.push(currentSection.join('\n'));
        }
        // Start new section - include the ## heading if we have one
        currentSection = [];
        if (lastTopicHeading) {
          currentSection.push(lastTopicHeading);
        }
        currentSection.push(line);
        continue;
      }
    }
    
    // Continue current section (add all non-heading lines)
    if (currentSection.length > 0 || line.trim()) {
      currentSection.push(line);
    }
  }
  
  // Don't forget the last section
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }
  
  return sections.filter(s => s.trim().length > 0);
}

/**
 * Extract metadata from YAML format
 */
function extractYAMLMetadata(section: string): SectionMetadata | null {
  // Handle quoted values first (double quotes, single quotes), then unquoted
  // Use comprehensive pattern that handles special characters (em dashes, ampersands, etc.)
  const personaMatch = section.match(/^persona:\s*"([^"]+)"|^persona:\s*'([^']+)'|^persona:\s*([^\n\r]+)/m);
  const topicMatch = section.match(/^topic:\s*"([^"]+)"|^topic:\s*'([^']+)'|^topic:\s*([^\n\r]+)/m);
  const subtopicMatch = section.match(/^subtopic:\s*"([^"]+)"|^subtopic:\s*'([^']+)'|^subtopic:\s*([^\n\r]+)/m);
  
  if (!personaMatch || !topicMatch || !subtopicMatch) {
    return null;
  }
  
  // Extract the matched value (first non-empty capture group)
  const getValue = (match: RegExpMatchArray): string => {
    return (match[1] || match[2] || match[3] || '').trim();
  };
  
  return {
    persona: getValue(personaMatch),
    topic: getValue(topicMatch),
    subtopic: getValue(subtopicMatch),
  };
}

/**
 * Extract metadata from Markdown format
 */
function extractMarkdownMetadata(section: string): SectionMetadata | null {
  const personaMatch = section.match(/\*\*Persona:\*\*\s*([^\r\n]+?)(?:\s*[\r\n]|$)/);
  const topicMatch = section.match(/\*\*Topic:\*\*\s*([^\r\n]+?)(?:\s*[\r\n]|$)/);
  const subtopicMatch = section.match(/\*\*Subtopic:\*\*\s*([^\r\n]+?)(?:\s*[\r\n]|$)/);
  
  if (!personaMatch || !topicMatch || !subtopicMatch) {
    return null;
  }
  
  return {
    persona: personaMatch[1].trim(),
    topic: topicMatch[1].trim(),
    subtopic: subtopicMatch[1].trim(),
  };
}

/**
 * Extract content from YAML format
 */
function extractYAMLContent(section: string): { content: string; contentSections: ContentSections } {
  const contentSections: ContentSections = {
    has_content: false,
    has_action_tips: false,
    has_motivation: false,
    has_followup: false,
    has_habit_strategy: false,
  };
  
  const contentParts: string[] = [];
  
  // Extract content_text (main content) - add markdown header for formatter
  // Improved regex: matches content_text with | marker, captures until next field or end of section
  const contentTextMatch = section.match(/^content_text:\s*\|\s*\n([\s\S]*?)(?=^(?:[a-z_]+:|---$|\Z))/m);
  if (contentTextMatch) {
    let content = contentTextMatch[1].trim();
    // Remove leading indentation (YAML block scalar - typically 2 spaces)
    content = content.split('\n').map(line => line.replace(/^\s{2,}/, '')).join('\n').trim();
    if (content) {
      contentSections.has_content = true;
      // Add markdown header so formatter can parse it
      contentParts.push(`### **Content**\n${content}`);
    }
  }
  
  // Extract action_tips - include ALL bullet points
  // Process section line by line to find action_tips block and capture ALL tips
  const lines = section.split('\n');
  let inActionTips = false;
  const tipLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if we've reached the action_tips field
    if (trimmed === 'action_tips:' || trimmed.startsWith('action_tips:')) {
      inActionTips = true;
      continue;
    }
    
    // If we're in the action_tips block
    if (inActionTips) {
      // Check if we've hit the next YAML field (starts with lowercase/underscore + colon, not indented)
      // A field is at the start of a line (no or minimal indentation - 0-2 spaces)
      // Also check for section separator (---)
      if (trimmed === '---') {
        break; // Section separator found
      }
      
      if (trimmed && /^[a-z_]+:/.test(trimmed)) {
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        // If indent is 0-2, it's a new top-level field, so we're done
        if (indent <= 2) {
          break;
        }
      }
      
      // Capture ALL lines that are bullet points (start with - or •)
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        tipLines.push(trimmed);
      }
    }
  }
  
  if (tipLines.length > 0) {
    contentSections.has_action_tips = true;
    // Remove bullet marker and quotes, keep the content
    const cleanedTips = tipLines.map(line => {
      let cleaned = line.trim();
      // Remove bullet marker (- or •) and any following whitespace
      cleaned = cleaned.replace(/^[-•]\s+/, '');
      // Remove surrounding quotes (single or double)
      cleaned = cleaned.replace(/^["']|["']$/g, '');
      return cleaned.trim();
    }).filter(tip => tip.length > 0); // Remove any empty strings
    
    if (cleanedTips.length > 0) {
      // Add markdown header so formatter can parse it
      contentParts.push(`### **Action Tips**\n${cleanedTips.map(tip => `- ${tip}`).join('\n')}`);
    }
  }
  
  // Extract motivation_nudge - content only, no label
  // Improved regex: handles both single-line (quoted) and multi-line (|) formats, captures until next field or end
  const motivationMatch = section.match(/^motivation_nudge:\s*(?:\|\s*\n)?([\s\S]*?)(?=^(?:[a-z_]+:|---$|\Z))/m);
  if (motivationMatch) {
    let motivation = motivationMatch[1].trim();
    // Handle both single-line and multi-line YAML
    if (motivation.includes('\n')) {
      motivation = motivation.split('\n').map(line => line.replace(/^\s{2,}/, '')).join('\n').trim();
    }
    motivation = motivation.replace(/^["']|["']$/g, '').trim();
    if (motivation) {
      contentSections.has_motivation = true;
      // Add markdown header so formatter can parse it
      contentParts.push(`### **Motivation Nudge**\n${motivation}`);
    }
  }
  
  // Extract habit_strategy - handles both pipe format (|) for multi-line markdown and structured fields
  // Improved regex: captures until next field or end of section
  const habitStrategyMatch = section.match(/^habit_strategy:\s*(?:\|\s*\n)?([\s\S]*?)(?=^(?:[a-z_]+:|---$|\Z))/m);
  if (habitStrategyMatch) {
    let strategy = habitStrategyMatch[1].trim();
    
    // Handle pipe format: remove leading indentation (2 spaces per line) that YAML adds
    if (strategy.includes('\n')) {
      const lines = strategy.split('\n');
      // Remove common leading whitespace (YAML pipe format indentation)
      const minIndent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^(\s*)/)?.[1]?.length || 0));
      if (minIndent > 0) {
        strategy = lines.map(line => line.slice(Math.min(minIndent, line.length))).join('\n');
      }
    }
    
    // Remove surrounding quotes if present
    strategy = strategy.replace(/^["']|["']$/g, '').trim();
    
    // Check if it's structured format (has field names) or free-form markdown
    const hasStructuredFields = /^\s*(?:principle|explanation|example|habit_tip):/m.test(strategy);
    
    if (hasStructuredFields) {
      // Legacy structured format: extract fields
    const strategyParts: string[] = [];
    const principleMatch = strategy.match(/^\s*principle:\s*["']?([^"'\n]+)["']?/m);
    const explanationMatch = strategy.match(/^\s*explanation:\s*["']?([^"'\n]+)["']?/m);
    const exampleMatch = strategy.match(/^\s*example:\s*["']?([^"'\n]+)["']?/m);
    const tipMatch = strategy.match(/^\s*habit_tip:\s*["']?([^"'\n]+)["']?/m);
    
    if (principleMatch) strategyParts.push(principleMatch[1].trim());
    if (explanationMatch) strategyParts.push(explanationMatch[1].trim());
    if (exampleMatch) strategyParts.push(exampleMatch[1].trim());
    if (tipMatch) strategyParts.push(tipMatch[1].trim());
    
    if (strategyParts.length > 0) {
      contentSections.has_habit_strategy = true;
      contentParts.push(`### **Habit Strategy**\n${strategyParts.join('\n')}`);
      }
    } else if (strategy.length > 0) {
      // Free-form markdown format (pipe format) - preserve as-is
      contentSections.has_habit_strategy = true;
      // Preserve all markdown formatting (bold, emojis, line breaks, etc.)
      contentParts.push(`### **Habit Strategy**\n${strategy}`);
    }
  }
  
  // Extract follow_up_question - include it in content
  // Improved regex: handles both single-line (quoted) and multi-line (|) formats, captures until next field or end
  const followUpMatch = section.match(/^follow_up_question:\s*(?:\|\s*\n)?([\s\S]*?)(?=^(?:[a-z_]+:|---$|\Z))/m);
  if (followUpMatch) {
    let followUp = followUpMatch[1].trim();
    // Handle both single-line and multi-line YAML
    if (followUp.includes('\n')) {
      followUp = followUp.split('\n').map(line => line.replace(/^\s{2,}/, '')).join('\n').trim();
    }
    followUp = followUp.replace(/^["']|["']$/g, '').trim();
    if (followUp) {
      contentSections.has_followup = true;
      // Add markdown header so formatter can parse it
      contentParts.push(`### **Follow-Up Question**\n${followUp}`);
    }
  }
  
  // Combine all content parts with separators to preserve section structure
  const content = contentParts.join('\n\n---\n\n').trim();
  
  return { content, contentSections };
}

/**
 * Parse follow_up_links from YAML format
 */
function parseYAMLFollowUpLinks(section: string): FollowUpLink[] {
  const followUpLinks: FollowUpLink[] = [];
  
  // Match follow_up_links field
  const linksMatch = section.match(/^follow_up_links:\s*\n([\s\S]*?)(?=^(?:[a-z_]+:|---$|\Z))/m);
  
  if (!linksMatch) {
    return followUpLinks;
  }
  
  const linksText = linksMatch[1].trim();
  
  // Parse YAML list format:
  // - persona: "nutrition"
  //   topic: "Nutrition in Menopause"
  //   subtopic: "Protein Needs & Muscle Protection"
  //   label: "Learn about protein needs for muscle protection"
  
  // Split by list items (lines starting with -)
  const lines = linksText.split('\n');
  let currentLink: Partial<FollowUpLink> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    
    // Check if this is a new list item (starts with -)
    // Handle both formats: "-persona:" and "- persona:"
    if (trimmed.startsWith('-')) {
      // Save previous link if complete
      if (currentLink && currentLink.persona && currentLink.topic && currentLink.subtopic && currentLink.label) {
        followUpLinks.push(currentLink as FollowUpLink);
      }
      
      // Start new link
      currentLink = {};
      // Remove the - and any following space, then continue parsing
      const restOfLine = trimmed.substring(1).trim();
      if (restOfLine) {
        // Handle inline format: - persona: "value" or -persona: "value"
        const inlineMatch = restOfLine.match(/^persona:\s*["']?([^"'\n]+)["']?/);
        if (inlineMatch) {
          currentLink.persona = inlineMatch[1].trim();
        }
      }
      continue;
    }
    
    // Parse key-value pairs (handles both indented and non-indented formats)
    if (currentLink) {
      // Remove any leading indentation before matching
      const personaMatch = trimmed.match(/^persona:\s*["']?([^"'\n]+)["']?/);
      const topicMatch = trimmed.match(/^topic:\s*["']?([^"'\n]+)["']?/);
      const subtopicMatch = trimmed.match(/^subtopic:\s*["']?([^"'\n]+)["']?/);
      const labelMatch = trimmed.match(/^label:\s*["']?([^"'\n]+)["']?/);
      
      if (personaMatch) {
        currentLink.persona = personaMatch[1].trim();
      } else if (topicMatch) {
        currentLink.topic = topicMatch[1].trim();
      } else if (subtopicMatch) {
        currentLink.subtopic = subtopicMatch[1].trim();
      } else if (labelMatch) {
        // Handle label with or without quotes
        let labelValue = labelMatch[1].trim();
        // Remove quotes if present
        labelValue = labelValue.replace(/^["']|["']$/g, '');
        currentLink.label = labelValue;
      }
    }
  }
  
  // Don't forget the last link
  if (currentLink && currentLink.persona && currentLink.topic && currentLink.subtopic && currentLink.label) {
    followUpLinks.push(currentLink as FollowUpLink);
  }
  
  return followUpLinks;
}

/**
 * Extract content from Markdown format
 */
function extractMarkdownContent(section: string): { content: string; contentSections: ContentSections } {
  const contentSections: ContentSections = {
    has_content: false,
    has_action_tips: false,
    has_motivation: false,
    has_followup: false,
    has_habit_strategy: false,
  };
  
  const contentParts: string[] = [];
  
  // Define the content sections we want to extract (WITH section headers for formatter parsing)
  const contentSectionPatterns = [
    { 
      pattern: /(###\s*\*\*Content\*\*\s*\n[\s\S]*?)(?=###\s*\*\*(?:Action|Motivation|Habit|Follow-Up)|---\s*$|$)/i, 
      key: 'has_content' as keyof ContentSections,
      header: '### **Content**'
    },
    { 
      pattern: /(###\s*\*\*Action Tips?\*\*\s*\n[\s\S]*?)(?=###\s*\*\*(?:Content|Motivation|Habit|Follow-Up)|---\s*$|$)/i, 
      key: 'has_action_tips' as keyof ContentSections,
      header: '### **Action Tips**'
    },
    { 
      pattern: /(###\s*\*\*Motivation Nudge\*\*\s*\n[\s\S]*?)(?=###\s*\*\*(?:Content|Action|Habit|Follow-Up)|---\s*$|$)/i, 
      key: 'has_motivation' as keyof ContentSections,
      header: '### **Motivation Nudge**'
    },
    { 
      pattern: /(###\s*\*\*Habit Strategy[\s\S]*?\*\*\s*\n[\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Follow-Up)|---\s*$|$)/i, 
      key: 'has_habit_strategy' as keyof ContentSections,
      header: '### **Habit Strategy**'
    },
  ];
  
  // Extract each content section (INCLUDING headers so formatter can parse them)
  for (const { pattern, key } of contentSectionPatterns) {
    const match = section.match(pattern);
    if (match) {
      let extractedContent = match[1].trim(); // Includes header
      if (extractedContent && extractedContent.trim()) {
        contentSections[key] = true;
        
        // Remove any trailing separators
        extractedContent = extractedContent.replace(/\n*---\s*$/g, '');
        // Remove excessive whitespace (but preserve section breaks)
        extractedContent = extractedContent.replace(/\n{4,}/g, '\n\n\n');
        extractedContent = extractedContent.replace(/\n{3,}/g, '\n\n');
        
        // For Habit Strategy, remove field labels like "**Strategy:**", "**Principle:**", etc.
        // BUT keep the section header
        if (key === 'has_habit_strategy') {
          extractedContent = extractedContent.replace(/\*\*Strategy:\*\*\s*/gi, '');
          extractedContent = extractedContent.replace(/\*\*Principle:\*\*\s*/gi, '');
          extractedContent = extractedContent.replace(/\*\*Explanation:\*\*\s*/gi, '');
          extractedContent = extractedContent.replace(/\*\*Example:\*\*\s*/gi, '');
          extractedContent = extractedContent.replace(/\*\*Habit Tip:\*\*\s*/gi, '');
          extractedContent = extractedContent.replace(/\*\*Tip:\*\*\s*/gi, '');
        }
        
        if (extractedContent) {
          contentParts.push(extractedContent);
        }
      }
    }
  }
  
  // Extract follow_up_question - include header in content
  const followUpMatch = section.match(/(###\s*\*\*Follow-Up (?:Question|Questions)\*\*\s*\n[\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Habit|Keywords|Intent)|---\s*$|$)/i);
  if (followUpMatch) {
    let followUp = followUpMatch[1].trim(); // Includes header
    // Remove any trailing separators
    followUp = followUp.replace(/\n*---\s*$/g, '');
    // Remove excessive whitespace
    followUp = followUp.replace(/\n{3,}/g, '\n\n');
    if (followUp) {
      contentSections.has_followup = true;
      contentParts.push(followUp);
    }
  }
  
  // Combine all content parts with separators to preserve section structure
  // This ensures the formatter can properly parse each section
  let content = contentParts.join('\n\n---\n\n').trim();
  
  // If no content sections were found, try to extract any text after removing metadata
  if (!content) {
    // Remove section header (##)
    content = section.replace(/^##\s+.*?\n/g, '');
    // Remove metadata lines
    content = content.replace(/\*\*Persona:\*\*.*?\n/g, '');
    content = content.replace(/\*\*Topic:\*\*.*?\n/g, '');
    content = content.replace(/\*\*Subtopic:\*\*.*?\n/g, '');
    // Remove Intent Patterns section
    content = content.replace(/###\s*\*\*Intent Patterns?\*\*\s*\n[\s\S]*?(?=###|---\s*$|$)/i, '');
    // Remove Keywords section
    content = content.replace(/###\s*\*\*Keywords?\*\*\s*\n[\s\S]*?(?=###|---\s*$|$)/i, '');
    // Remove section headers (###)
    content = content.replace(/^###\s+.*?\n/gm, '');
    // Clean up
    content = content.replace(/^---\s*$/gm, '');
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.trim();
  }
  
  return { content, contentSections };
}

/**
 * Parse Intent Patterns from YAML format
 * Handles edge cases and validates results
 * Uses line-by-line parsing to handle all field order variations
 */
function parseYAMLIntentPatterns(section: string): string[] {
  const patterns: string[] = [];
  
  // Find the intent_patterns field
  const intentPatternsIndex = section.search(/^intent_patterns:/m);
  if (intentPatternsIndex === -1) {
    return patterns;
  }
  
  // Extract from intent_patterns: to next field or end
  const afterIntentPatterns = section.substring(intentPatternsIndex);
  const lines = afterIntentPatterns.split('\n');
  
  // Skip the "intent_patterns:" line
  const contentLines: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Stop if we hit another top-level field (starts at column 0 with fieldname:)
    // Check for various YAML field formats: fieldname:, fieldname: |, fieldname: "value", fieldname: 'value'
    if (trimmed.match(/^[a-z_]+:\s*$/) || trimmed.match(/^[a-z_]+:\s*\|/) || trimmed.match(/^[a-z_]+:\s*["']/)) {
      // Verify it's actually at column 0 (not indented)
      const originalLine = lines[i];
      if (originalLine.match(/^[a-z_]+:/)) {
        break;
      }
    }
    
    // Also check for unquoted values (fieldname: value)
    if (trimmed.match(/^[a-z_]+:\s+[^"'\n]/)) {
      const originalLine = lines[i];
      if (originalLine.match(/^[a-z_]+:/)) {
        break;
      }
    }
    
    // Stop if we hit section separator
    if (trimmed === '---') {
      break;
    }
    
    contentLines.push(line);
  }
  
  const patternsText = contentLines.join('\n').trim();
  if (!patternsText) {
    return patterns;
  }
  
  const patternLines = patternsText.split('\n');
  
  for (const line of patternLines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    // Skip headers like "PRIMARY INTENTS", "SECONDARY INTENTS", "TIER 1:", "TIER 2:", etc.
    if (trimmed.match(/^(PRIMARY|SECONDARY|TIER\s+\d+)\s+/i)) {
      continue;
    }
    // Skip cluster headers like "The "waking up at night" cluster:" or "The "can't fall asleep" cluster:"
    if (trimmed.match(/^The\s+["'].*?["']\s+cluster:/i)) {
      continue;
    }
    // Skip lines that are just descriptive text (contain "QUESTIONS", "CLUSTER", etc. but not bullet points)
    if (trimmed.match(/^(QUESTIONS|CLUSTER|INTENTS?):/i) && !trimmed.match(/^[-•]/)) {
      continue;
    }
    // Match bullet points (- or •)
    if (trimmed.match(/^[-•]\s+/)) {
      let pattern = trimmed.replace(/^[-•]\s+/, '').replace(/^["']|["']$/g, '').trim();
      
      // Remove trailing notes in brackets like "[+ route based on follow-up]"
      pattern = pattern.replace(/\s*\[\+.*?\]\s*$/, '').trim();
      
      // Remove any trailing parentheses with notes
      pattern = pattern.replace(/\s*\([^)]*\)\s*$/, '').trim();
      
      // Validate: pattern must be non-empty and have at least 3 characters
      if (pattern && pattern.length >= 3) {
        patterns.push(pattern);
      }
    }
  }
  
  return patterns;
}

/**
 * Parse Intent Patterns from Markdown format
 * Handles edge cases and validates results
 */
function parseMarkdownIntentPatterns(section: string): string[] {
  const patterns: string[] = [];
  const intentPatternsMatch = section.match(/###\s*\*\*Intent Patterns?\*\*\s*\n([\s\S]*?)(?=###|---\s*$|$)/i);
  
  if (!intentPatternsMatch) {
    return patterns;
  }
  
  const patternsText = intentPatternsMatch[1];
  const lines = patternsText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    // Skip headers like "PRIMARY INTENTS", "SECONDARY INTENTS", "TIER 1:", "TIER 2:", etc.
    if (trimmed.match(/^(PRIMARY|SECONDARY|TIER\s+\d+)\s+/i)) {
      continue;
    }
    // Skip cluster headers like "The "waking up at night" cluster:" or "The "can't fall asleep" cluster:"
    if (trimmed.match(/^The\s+["'].*?["']\s+cluster:/i)) {
      continue;
    }
    // Skip lines that are just descriptive text (contain "QUESTIONS", "CLUSTER", etc. but not bullet points)
    if (trimmed.match(/^(QUESTIONS|CLUSTER|INTENTS?):/i) && !trimmed.match(/^[-•]/)) {
      continue;
    }
    // Match bullet points (- or •)
    if (trimmed.match(/^[-•]\s+/)) {
      let pattern = trimmed.replace(/^[-•]\s+/, '').trim();
      
      // Remove surrounding quotes if present
      pattern = pattern.replace(/^["']|["']$/g, '').trim();
      
      // Remove any trailing notes like "[+ route based on follow-up]"
      pattern = pattern.replace(/\s*\[\+.*?\]\s*$/, '').trim();
      
      // Remove any trailing parentheses with notes
      pattern = pattern.replace(/\s*\([^)]*\)\s*$/, '').trim();
      
      // Validate: pattern must be non-empty and have at least 3 characters
      if (pattern && pattern.length >= 3) {
        patterns.push(pattern);
      }
    }
  }
  
  return patterns;
}

/**
 * Parse Keywords from YAML format
 */
function parseYAMLKeywords(section: string): string[] {
  const keywords: string[] = [];
  
  // Try to match keywords section with a clear ending (another field or ---)
  let keywordsMatch = section.match(/^keywords:\s*\n([\s\S]*?)(?=\n[a-z_]+:|\n---)/m);
  
  // If no match, try matching keywords to end of section (when keywords is last)
  if (!keywordsMatch) {
    keywordsMatch = section.match(/^keywords:\s*\n([\s\S]*)$/m);
  }
  
  if (!keywordsMatch) {
    return keywords;
  }
  
  const keywordsText = keywordsMatch[1].trim();
  if (!keywordsText) {
    return keywords;
  }
  
  const lines = keywordsText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    // Match bullet points (- or •)
    if (trimmed.match(/^[-•]\s+/)) {
      const keyword = trimmed.replace(/^[-•]\s+/, '').replace(/^["']|["']$/g, '').trim();
      if (keyword) {
        keywords.push(keyword);
      }
    }
  }
  
  return keywords;
}

/**
 * Parse Keywords from Markdown format
 */
function parseMarkdownKeywords(section: string): string[] {
  const keywords: string[] = [];
  const keywordsMatch = section.match(/###\s*\*\*Keywords?\*\*\s*\n([\s\S]*?)(?=###|---\s*$|$)/);
  
  if (!keywordsMatch) {
    return keywords;
  }
  
  const keywordsText = keywordsMatch[1].trim();
  const lines = keywordsText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    // Match bullet points (- or •)
    if (trimmed.match(/^[-•]\s+/)) {
      const keyword = trimmed.replace(/^[-•]\s+/, '').trim();
      if (keyword) {
        keywords.push(keyword);
      }
    }
  }
  
  return keywords;
}

/**
 * Estimate token count (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split content into chunks if it exceeds token or character limit
 * Enforces both token limit (for model) and character limit (for Supabase UI display)
 */
function chunkContentIfNeeded(content: string, maxTokens: number = 2000, maxChars: number = 10000): string[] {
  // Check both token and character limits
  const estimatedTokens = estimateTokens(content);
  const charLength = content.length;
  
  if (estimatedTokens <= maxTokens && charLength <= maxChars) {
    return [content];
  }
  
  // Split by paragraphs (double newlines) first
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const testChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    const testTokens = estimateTokens(testChunk);
    const testChars = testChunk.length;
    
    // Check both limits
    if (testTokens <= maxTokens && testChars <= maxChars) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If single paragraph is too large, split by sentences
      const paraTokens = estimateTokens(paragraph);
      const paraChars = paragraph.length;
      
      if (paraTokens > maxTokens || paraChars > maxChars) {
        const sentences = paragraph.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
        let sentenceChunk = '';
        
        for (const sentence of sentences) {
          const testSentenceChunk = sentenceChunk ? `${sentenceChunk}. ${sentence}` : sentence;
          const testSentenceTokens = estimateTokens(testSentenceChunk);
          const testSentenceChars = testSentenceChunk.length;
          
          if (testSentenceTokens <= maxTokens && testSentenceChars <= maxChars) {
            sentenceChunk = testSentenceChunk;
          } else {
            if (sentenceChunk) {
              chunks.push(sentenceChunk + '.');
            }
            // If even a single sentence is too large, split by words (last resort)
            if (sentence.length > maxChars) {
              // Split very long sentences by words
              const words = sentence.split(/\s+/);
              let wordChunk = '';
              
              for (const word of words) {
                const testWordChunk = wordChunk ? `${wordChunk} ${word}` : word;
                if (testWordChunk.length <= maxChars) {
                  wordChunk = testWordChunk;
                } else {
                  if (wordChunk) {
                    chunks.push(wordChunk);
                  }
                  wordChunk = word;
                }
              }
              
              if (wordChunk) {
                sentenceChunk = wordChunk;
              } else {
                sentenceChunk = '';
              }
            } else {
              sentenceChunk = sentence;
            }
          }
        }
        
        if (sentenceChunk) {
          currentChunk = sentenceChunk + '.';
        } else {
          currentChunk = '';
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.length > 0 ? chunks : [content];
}

/**
 * Enhance content with intents and keywords for better vector search
 * Optimized for maximum semantic matching accuracy by:
 * - Adding topic/subtopic explicitly at the start for context
 * - Clearly labeling intent patterns with heading so embedding models understand these are user queries to match
 * - Including ALL intent patterns as a single clear list (they're designed to match user queries exactly)
 * - Adding keywords for additional semantic coverage
 * - Prioritizing intent patterns before content for intent-first retrieval approach
 */
function enhanceContentWithMetadata(
  content: string,
  intent_patterns: string[],
  keywords: string[],
  topic: string,
  subtopic: string
): string {
  const enhancementParts: string[] = [];
  
  // Add topic and subtopic explicitly at the start for context
  enhancementParts.push(`Topic: ${topic}. Subtopic: ${subtopic}.`);
  enhancementParts.push(''); // Empty line for readability
  
  // Add intent patterns with clear heading and context
  // This makes it explicit to embedding models that these are user queries to match
  if (intent_patterns.length > 0) {
    // Clean intent patterns (remove PRIMARY/SECONDARY markers, trim quotes)
    const cleanedIntents = intent_patterns
      .map(ip => ip.replace(/\s*(PRIMARY|SECONDARY)\s*/gi, '').replace(/^["']|["']$/g, '').trim())
      .filter(ip => ip.length > 0);
    
    if (cleanedIntents.length > 0) {
      // Add clear heading and context for embedding models
      enhancementParts.push('### Intent Patterns:');
      enhancementParts.push('These intent patterns represent common user queries that match this content:');
      enhancementParts.push(''); // Empty line
      
      // Single clear list of all intents formatted as bullet points
      // This provides clearer semantic signals than repetition
      const intentLines = cleanedIntents.map(intent => `- ${intent}`);
      enhancementParts.push(...intentLines);
      
      enhancementParts.push(''); // Empty line separator
    }
  }
  
  // Add keywords as topic context (supplements intents)
  if (keywords.length > 0) {
    const uniqueKeywords = [...new Set(keywords)].filter(k => k.length > 0);
    if (uniqueKeywords.length > 0) {
      // Include top 20 keywords for better semantic coverage
      const displayKeywords = uniqueKeywords.slice(0, 20);
      if (displayKeywords.length === 1) {
        enhancementParts.push(`Keywords: ${displayKeywords[0]}.`);
      } else if (displayKeywords.length <= 15) {
        enhancementParts.push(`Keywords: ${displayKeywords.join(', ')}.`);
      } else {
        enhancementParts.push(`Keywords: ${displayKeywords.slice(0, 15).join(', ')}, and more.`);
      }
      enhancementParts.push(''); // Empty line separator
    }
  }
  
  // Combine enhancements with original content
  if (enhancementParts.length > 0) {
    return enhancementParts.join('\n') + content;
  }
  
  return content;
}

/**
 * Parse a single section into structured format
 * May return multiple documents if content needs to be chunked
 * Validates parsed sections and returns empty array if validation fails
 */
function parseSection(section: string, format: FileFormat, source: string, sectionIndex: number): ParsedSection[] {
  let metadata: SectionMetadata | null;
  let content: string;
  let contentSections: ContentSections;
  let intent_patterns: string[];
  let keywords: string[];
  let follow_up_links: FollowUpLink[] = [];
  
  if (format === 'yaml') {
    metadata = extractYAMLMetadata(section);
    if (!metadata) {
      console.warn(`   ⚠️  [${source}:${sectionIndex}] Missing required metadata (persona, topic, or subtopic)`);
      return [];
    }
    const contentResult = extractYAMLContent(section);
    content = contentResult.content;
    contentSections = contentResult.contentSections;
    intent_patterns = parseYAMLIntentPatterns(section);
    keywords = parseYAMLKeywords(section);
    follow_up_links = parseYAMLFollowUpLinks(section);
  } else {
    metadata = extractMarkdownMetadata(section);
    if (!metadata) {
      console.warn(`   ⚠️  [${source}:${sectionIndex}] Missing required metadata (persona, topic, or subtopic)`);
      return [];
    }
    const contentResult = extractMarkdownContent(section);
    content = contentResult.content;
    contentSections = contentResult.contentSections;
    intent_patterns = parseMarkdownIntentPatterns(section);
    keywords = parseMarkdownKeywords(section);
    // Markdown format doesn't support follow_up_links yet (can be added later if needed)
    follow_up_links = [];
  }
  
  // Validate parsed section
  // Check for non-empty content
  if (!content || content.trim().length === 0) {
    console.warn(`   ⚠️  [${source}:${sectionIndex}] Empty content for "${metadata.topic}" / "${metadata.subtopic}"`);
    return [];
  }
  
  // Check for valid metadata fields
  if (!metadata.persona || !metadata.topic || !metadata.subtopic) {
    console.warn(`   ⚠️  [${source}:${sectionIndex}] Invalid metadata - missing persona, topic, or subtopic`);
    return [];
  }
  
  // Warn if no intent patterns (not fatal, but important for retrieval)
  // This is a critical issue that needs attention
  if (intent_patterns.length === 0) {
    console.warn(`   ⚠️  [${source}:${sectionIndex}] No intent patterns found for "${metadata.topic}" / "${metadata.subtopic}" - THIS IS A PROBLEM - retrieval may be less accurate`);
  }
  
  // Enhance content with intents and keywords for better vector search
  // This makes intents and keywords part of the semantic search, not just re-ranking
  const enhancedContent = enhanceContentWithMetadata(
    content, 
    intent_patterns, 
    keywords,
    metadata.topic,
    metadata.subtopic
  );
  
  // CRITICAL: Each section = 1 complete answer, so NO chunking
  // Only chunk if content is extremely large (exceeds embedding model limits)
  // Using very high limits to preserve section integrity
  const MAX_TOKENS_PER_SECTION = 8000; // Increased from 6000 (model max is 8192)
  const MAX_CHARS_PER_SECTION = 30000; // Increased from 24000 for Supabase
  
  const contentChunks = chunkContentIfNeeded(enhancedContent, MAX_TOKENS_PER_SECTION, MAX_CHARS_PER_SECTION);
  
  // Validate that sections aren't being split (this should be rare)
  if (contentChunks.length > 1) {
    console.warn(`   ⚠️  [${source}:${sectionIndex}] Section "${metadata.subtopic}" was split into ${contentChunks.length} chunks - this should be rare!`);
  }
  
  // Return one document per section (chunking only as last resort for extremely large sections)
  return contentChunks.map((chunk) => {
    // ALL chunks must have intent patterns in metadata for proper retrieval
    // Intent patterns are critical for verbatim mode and exact intent matching
    const chunkIntentPatterns = intent_patterns; // Include intents in ALL chunks
    
    return {
      metadata,
      content: chunk,
      intent_patterns: chunkIntentPatterns,
      keywords, // Keywords included in all chunks for context
      content_sections: contentSections,
      follow_up_links: follow_up_links.length > 0 ? follow_up_links : undefined,
    };
  });
}

/**
 * Load knowledge base documents from markdown files in the knowledge-base folder
 * Returns section-based documents with structured metadata
 */
async function loadDocuments(): Promise<Document[]> {
  const documents: Document[] = [];
  const kbDir = path.join(process.cwd(), 'knowledge-base');
  
  // Check if knowledge-base directory exists
  if (!fs.existsSync(kbDir)) {
    console.warn(`⚠️  Knowledge base directory not found: ${kbDir}`);
    return documents;
  }
  
  // Get all .md and .txt files from the knowledge-base directory
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  
  if (files.length === 0) {
    console.warn(`⚠️  No markdown or text files found in ${kbDir}`);
    return documents;
  }
  
  console.log(`📄 Found ${files.length} file(s) to process`);
  
  // Process each file
  const failedFiles: Array<{ file: string; error: string }> = [];
  const failedSections: Array<{ file: string; sectionIndex: number; error: string }> = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(kbDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Detect file format
      const format = detectFormat(content);
      console.log(`   📑 ${file}: Format detected: ${format.toUpperCase()}`);
      
      // Parse into sections based on format
      const sections = format === 'yaml' ? parseYAMLSections(content) : parseMarkdownSections(content);
      console.log(`   📑 ${file}: Found ${sections.length} section(s)`);
      
      // Log each section's subtopic for debugging and validation
      if (sections.length > 0 && format === 'yaml') {
        sections.forEach((section, idx) => {
          const subtopicMatch = section.match(/^subtopic:\s*["']([^"']+)["']|^subtopic:\s*([^\n]+)/m);
          const subtopic = subtopicMatch ? (subtopicMatch[1] || subtopicMatch[2] || '').trim() : `Section ${idx + 1}`;
          // Verify section has all required fields
          const hasPersona = /^persona:/m.test(section);
          const hasTopic = /^topic:/m.test(section);
          const hasSubtopic = /^subtopic:/m.test(section);
          const status = (hasPersona && hasTopic && hasSubtopic) ? '✓' : '⚠️';
          console.log(`      ${status} Section ${idx + 1}: "${subtopic.substring(0, 60)}"`);
        });
      }
      
      let sectionIndex = 0;
      let successfulSections = 0;
      let sectionsWithIntentPatterns = 0;
      let totalIntentPatterns = 0;
      
      for (const section of sections) {
        try {
          const parsedSections = parseSection(section, format, file, sectionIndex);
          
          for (const parsed of parsedSections) {
            if (parsed && parsed.content.trim().length > 0) {
              // Track intent patterns statistics
              if (parsed.intent_patterns.length > 0) {
                sectionsWithIntentPatterns++;
                totalIntentPatterns += parsed.intent_patterns.length;
              }
              
              // Build metadata object for Supabase
              const metadata = {
                persona: parsed.metadata.persona,
                topic: parsed.metadata.topic,
                subtopic: parsed.metadata.subtopic,
                source: file,
                section_index: sectionIndex,
                intent_patterns: parsed.intent_patterns,
                keywords: parsed.keywords,
                content_sections: parsed.content_sections,
                ...(parsed.follow_up_links && parsed.follow_up_links.length > 0 ? { follow_up_links: parsed.follow_up_links } : {}),
              };
              
              documents.push(new Document({
                pageContent: parsed.content,
                metadata: metadata,
              }));
              successfulSections++;
            }
          }
          
          if (parsedSections.length > 0) {
            sectionIndex++;
          }
        } catch (sectionError: unknown) {
          const errorMessage = sectionError instanceof Error ? sectionError.message : String(sectionError);
          failedSections.push({
            file,
            sectionIndex,
            error: errorMessage
          });
          console.error(`   ✗ Error parsing section ${sectionIndex} in ${file}: ${errorMessage}`);
          // Continue processing other sections
          sectionIndex++;
        }
      }
      
      // Enhanced logging with intent patterns statistics
      const intentPatternsInfo = sectionsWithIntentPatterns > 0 
        ? ` (${sectionsWithIntentPatterns} with intent patterns, ${totalIntentPatterns} total patterns)`
        : ' (⚠️ NO INTENT PATTERNS FOUND)';
      console.log(`   ✓ Loaded ${successfulSections} section(s) from ${file}${intentPatternsInfo}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failedFiles.push({ file, error: errorMessage });
      console.error(`   ✗ Error loading ${file}: ${errorMessage}`);
    }
  }
  
  // Report failures at the end
  if (failedFiles.length > 0 || failedSections.length > 0) {
    console.log(`\n⚠️  Summary of failures:`);
    if (failedFiles.length > 0) {
      console.log(`   Files failed: ${failedFiles.length}`);
      failedFiles.forEach(({ file, error }) => {
        console.log(`     - ${file}: ${error}`);
      });
    }
    if (failedSections.length > 0) {
      console.log(`   Sections failed: ${failedSections.length}`);
      failedSections.forEach(({ file, sectionIndex, error }) => {
        console.log(`     - ${file}:${sectionIndex}: ${error}`);
      });
    }
  }
  
  return documents;
}

/**
 * Clear all existing documents from the database
 * Use this before re-ingestion to ensure clean state
 */
async function clearExistingDocuments(): Promise<void> {
  try {
    console.log("🗑️  Clearing existing documents from database...");
    
    // Get count first
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });
    
    if (count === 0) {
      console.log("   No existing documents to clear");
      return;
    }
    
    console.log(`   Found ${count} existing document(s)`);
    
    // Delete all documents - using a condition that always matches
    // Using .neq with a value that will never match ensures all rows are deleted
    const { error } = await supabase
      .from('documents')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000001'); // This matches all UUIDs (none will equal this)
    
    if (error) {
      throw error;
    }
    
    console.log("✅ Existing documents cleared");
  } catch (error) {
    console.error("❌ Error clearing documents:", error);
    throw error;
  }
}

/**
 * Ingest documents into Supabase vector store
 * Always clears existing documents before ingestion to ensure clean state
 */
async function ingestDocuments() {
  try {
    // Always clear existing documents first to ensure clean state
    await clearExistingDocuments();
    
    console.log("🔄 Loading documents...");
    const documents = await loadDocuments();
    console.log(`📚 Loaded ${documents.length} document sections`);

    if (documents.length === 0) {
      console.warn("⚠️  No documents to ingest. Please add documents to the knowledge-base folder.");
      return;
    }

    // Validate documents and filter out those that are too large
    // Using high limits to preserve section integrity (each section = 1 answer)
    const MAX_TOKENS = 8000; // Hard limit with safety buffer (model max is 8192)
    const MAX_CHARS = 24000; // High limit - sections should stay intact (Supabase text limit is much higher)
    const validDocuments: Document[] = [];
    let skippedDocuments = 0;

    console.log("🔍 Validating documents...");
    for (const doc of documents) {
      const tokens = estimateTokens(doc.pageContent);
      const chars = doc.pageContent.length;
      
      if (tokens > MAX_TOKENS || chars > MAX_CHARS) {
        console.warn(`   ⚠️  Skipping document (${tokens} tokens, ${chars} chars): "${doc.metadata.subtopic?.substring(0, 60)}..."`);
        skippedDocuments++;
      } else {
        validDocuments.push(doc);
      }
    }

    console.log(`✅ ${validDocuments.length} documents passed validation (${skippedDocuments} skipped due to size)`);

    if (validDocuments.length === 0) {
      console.error("❌ No valid documents to ingest after validation.");
      return;
    }

    console.log("⚙️  Generating embeddings and storing in Supabase...");
    console.log("   Processing documents in batches...");
    
    // Initialize vector store
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: "documents",
      queryName: "match_documents",
    });

    // Process documents in smaller batches to avoid complete failure
    const BATCH_SIZE = 10;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validDocuments.length; i += BATCH_SIZE) {
      const batch = validDocuments.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(validDocuments.length / BATCH_SIZE);
      
      try {
        console.log(`   Processing batch ${batchNum}/${totalBatches} (${batch.length} documents)...`);
        
        // Add documents to vector store in batches
        await vectorStore.addDocuments(batch);
        successCount += batch.length;
        console.log(`   ✓ Batch ${batchNum} completed`);
      } catch (batchError: unknown) {
        const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
        console.error(`   ✗ Batch ${batchNum} failed: ${errorMessage}`);
        
        // Try processing individually if batch fails
        console.log(`   Retrying batch ${batchNum} individually...`);
        for (const doc of batch) {
          try {
            const tokens = estimateTokens(doc.pageContent);
            const chars = doc.pageContent.length;
            if (tokens > MAX_TOKENS || chars > MAX_CHARS) {
              console.warn(`     ⚠️  Skipping document (${tokens} tokens, ${chars} chars): "${doc.metadata.subtopic?.substring(0, 50)}..."`);
              failCount++;
              continue;
            }
            
            await vectorStore.addDocuments([doc]);
            successCount++;
            console.log(`     ✓ Ingested: "${doc.metadata.subtopic?.substring(0, 50)}..."`);
          } catch (docError: unknown) {
            const docErrorMessage = docError instanceof Error ? docError.message : String(docError);
            failCount++;
            console.error(`     ✗ Failed: "${doc.metadata.subtopic?.substring(0, 50)}..." - ${docErrorMessage}`);
          }
        }
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < validDocuments.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log("\n✅ Document ingestion complete!");
    console.log(`   📊 Successfully ingested: ${successCount} documents`);
    if (failCount > 0 || skippedDocuments > 0) {
      console.log(`   ⚠️  Skipped/Failed: ${failCount + skippedDocuments} documents`);
    }
    console.log(`   🔍 Vector store ready for queries.`);
    
    // Print comprehensive summary statistics
    if (successCount > 0) {
      const ingestedDocs = validDocuments.slice(0, successCount);
      
      // Topic statistics
      const topics = new Set(ingestedDocs.map(d => d.metadata.topic));
      console.log(`\n📊 Ingestion Statistics:`);
      console.log(`   📖 Unique topics: ${topics.size}`);
      
      // Section statistics
      const sectionsByTopic = new Map<string, number>();
      ingestedDocs.forEach(doc => {
        const topic = doc.metadata.topic as string;
        sectionsByTopic.set(topic, (sectionsByTopic.get(topic) || 0) + 1);
      });
      console.log(`   📑 Total sections: ${ingestedDocs.length}`);
      console.log(`   📚 Sections per topic:`);
      Array.from(sectionsByTopic.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([topic, count]) => {
          console.log(`      - ${topic}: ${count} section(s)`);
        });
      
      // Intent pattern statistics
      const totalPatterns = ingestedDocs.reduce((sum, d) => sum + (d.metadata.intent_patterns?.length || 0), 0);
      const avgPatterns = totalPatterns > 0 ? (totalPatterns / ingestedDocs.length).toFixed(1) : '0';
      const sectionsWithPatterns = ingestedDocs.filter(d => (d.metadata.intent_patterns?.length || 0) > 0).length;
      const sectionsWithoutPatterns = ingestedDocs.length - sectionsWithPatterns;
      console.log(`   💬 Intent patterns:`);
      console.log(`      - Total: ${totalPatterns}`);
      console.log(`      - Average per section: ${avgPatterns}`);
      console.log(`      - Sections with patterns: ${sectionsWithPatterns}/${ingestedDocs.length}`);
      if (sectionsWithoutPatterns > 0) {
        console.log(`      - ⚠️  Sections WITHOUT patterns: ${sectionsWithoutPatterns} (THIS IS A PROBLEM)`);
      }
      
      // Keyword statistics
      const totalKeywords = ingestedDocs.reduce((sum, d) => sum + (d.metadata.keywords?.length || 0), 0);
      const avgKeywords = totalKeywords > 0 ? (totalKeywords / ingestedDocs.length).toFixed(1) : '0';
      const sectionsWithKeywords = ingestedDocs.filter(d => (d.metadata.keywords?.length || 0) > 0).length;
      console.log(`   🏷️  Keywords:`);
      console.log(`      - Total: ${totalKeywords}`);
      console.log(`      - Average per section: ${avgKeywords}`);
      console.log(`      - Sections with keywords: ${sectionsWithKeywords}/${ingestedDocs.length}`);
      
      // Content sections statistics
      const contentSectionsStats = {
        has_content: 0,
        has_action_tips: 0,
        has_motivation: 0,
        has_followup: 0,
        has_habit_strategy: 0,
      };
      ingestedDocs.forEach(doc => {
        const sections = doc.metadata.content_sections as ContentSections | undefined;
        if (sections) {
          if (sections.has_content) contentSectionsStats.has_content++;
          if (sections.has_action_tips) contentSectionsStats.has_action_tips++;
          if (sections.has_motivation) contentSectionsStats.has_motivation++;
          if (sections.has_followup) contentSectionsStats.has_followup++;
          if (sections.has_habit_strategy) contentSectionsStats.has_habit_strategy++;
        }
      });
      console.log(`   📋 Content sections:`);
      console.log(`      - Has content: ${contentSectionsStats.has_content}`);
      console.log(`      - Has action tips: ${contentSectionsStats.has_action_tips}`);
      console.log(`      - Has motivation: ${contentSectionsStats.has_motivation}`);
      console.log(`      - Has follow-up: ${contentSectionsStats.has_followup}`);
      console.log(`      - Has habit strategy: ${contentSectionsStats.has_habit_strategy}`);
    }
  } catch (error) {
    console.error("❌ Error ingesting documents:", error);
    process.exit(1);
  }
}

// Run the ingestion
if (require.main === module) {
  // Check environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Missing OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  ingestDocuments()
    .then(() => {
      console.log("\n✨ Ingestion complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { ingestDocuments, loadDocuments };
