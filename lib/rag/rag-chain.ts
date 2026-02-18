/**
 * RAG Chain Wrapper
 * Wraps retrieval and generation in a LangChain chain
 * Handles all three retrieval modes with proper persona prompting
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import type { Persona, RetrievalMode, ConversationMessage } from "./types";
import { getPersonaSystemPrompt } from "./persona-prompts";

// Initialize LLM instances
const llmStandard = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const llmKnowledgeBase = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.35, // Lower temperature for KB-grounded responses
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export interface RAGChainInput {
  query: string;
  persona: Persona;
  mode: RetrievalMode;
  conversationHistory?: ConversationMessage[];
  kbContext?: string;
  userContext?: string;
  trackerContext?: string;
}

export interface RAGChainOutput {
  response: string;
  personaUsed: Persona;
  source: "kb" | "llm";
}

/**
 * Generate response using RAG chain
 * Handles all three retrieval modes with proper prompting
 */
export async function generateRAGResponse(input: RAGChainInput): Promise<RAGChainOutput> {
  const { query, persona, mode, conversationHistory, kbContext, userContext, trackerContext } = input;

  // Select appropriate LLM based on mode and KB availability
  const llmToUse = (mode === "hybrid" && kbContext) ? llmKnowledgeBase : llmStandard;

  // Build system prompt with persona
  // Pass query for state detection (low energy, overtraining) and WHY routing
  const personaPrompt = getPersonaSystemPrompt(persona, query);
  const systemParts: string[] = [personaPrompt];

  // Add KB context for hybrid mode
  if (mode === "hybrid" && kbContext) {
    systemParts.push(`\n\n=== KNOWLEDGE BASE CONTEXT ===
You have access to knowledge base content that provides evidence-based information. Use this content to ground your responses while generating personalized plans and recommendations.

KNOWLEDGE BASE CONTENT:
${kbContext}

INSTRUCTIONS:
- Use the knowledge base content as evidence for your recommendations
- Generate personalized plans and meal/workout ideas based on the KB data
- Combine KB evidence with creative, practical suggestions
- Maintain your persona's tone and style
- Personalize with user context when relevant`);
  }

  // Add user context if provided
  if (userContext) {
    systemParts.push(userContext);
  }

  // Add tracker context if provided
  if (trackerContext) {
    systemParts.push(`\n${trackerContext}`);
  }

  // Add conversation history note
  if (conversationHistory && conversationHistory.length > 0) {
    systemParts.push(`\nNote: You have access to ${conversationHistory.length} previous conversation turns. Use this history to provide continuity and personalized responses.`);
  }

  const systemMessage = systemParts.join("\n");

  // Build messages array
  const messages: BaseMessage[] = [new SystemMessage(systemMessage)];

  // Add conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      if (msg.role === "user") {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === "assistant") {
        messages.push(new AIMessage(msg.content));
      }
    }
  }

  // Add current query
  messages.push(new HumanMessage(query));

  // Generate response
  const response = await llmToUse.invoke(messages);
  
  // Extract text content
  let responseText = "";
  if (typeof response.content === 'string') {
    responseText = response.content;
  } else if (Array.isArray(response.content)) {
    responseText = response.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  } else {
    responseText = String(response.content || '');
  }

  return {
    response: responseText,
    personaUsed: persona,
    source: kbContext ? "kb" : "llm",
  };
}
