/**
 * Conversation Memory System
 * Manages conversation history per session with persona tracking
 * Uses in-memory storage (can be swapped to Supabase later)
 */

import type { ConversationMessage, ConversationMemory, Persona } from "./types";

// In-memory storage: Map<sessionId, ConversationMemory>
const memoryStore = new Map<string, ConversationMemory>();

// Maximum number of messages to keep per session
const MAX_MESSAGES = 10;

/**
 * Get conversation history for a session
 * Returns last MAX_MESSAGES messages
 */
export function getConversationHistory(sessionId: string): ConversationMessage[] {
  const memory = memoryStore.get(sessionId);
  if (!memory) {
    return [];
  }
  
  // Return last MAX_MESSAGES messages
  return memory.messages.slice(-MAX_MESSAGES);
}

/**
 * Add a message to conversation history
 * Automatically limits to MAX_MESSAGES messages
 */
export function addMessage(sessionId: string, message: ConversationMessage): void {
  let memory = memoryStore.get(sessionId);
  
  if (!memory) {
    memory = {
      sessionId,
      messages: [],
      userPreferences: {},
    };
    memoryStore.set(sessionId, memory);
  }
  
  // Add message
  memory.messages.push(message);
  
  // Limit to last MAX_MESSAGES messages
  if (memory.messages.length > MAX_MESSAGES) {
    memory.messages = memory.messages.slice(-MAX_MESSAGES);
  }
  
  // Update timestamp
  memory.messages.forEach(msg => {
    if (!msg.timestamp) {
      msg.timestamp = Date.now();
    }
  });
}

/**
 * Get user preferences for a session
 */
export function getUserPreferences(sessionId: string): Record<string, any> {
  const memory = memoryStore.get(sessionId);
  return memory?.userPreferences || {};
}

/**
 * Update user preferences for a session
 */
export function updateUserPreferences(
  sessionId: string,
  preferences: Record<string, any>
): void {
  let memory = memoryStore.get(sessionId);
  
  if (!memory) {
    memory = {
      sessionId,
      messages: [],
      userPreferences: {},
    };
    memoryStore.set(sessionId, memory);
  }
  
  memory.userPreferences = {
    ...memory.userPreferences,
    ...preferences,
  };
}

/**
 * Clear conversation history for a session
 */
export function clearHistory(sessionId: string): void {
  memoryStore.delete(sessionId);
}

/**
 * Get full conversation memory for a session
 */
export function getConversationMemory(sessionId: string): ConversationMemory | null {
  return memoryStore.get(sessionId) || null;
}

/**
 * Initialize or get conversation memory for a session
 */
export function initializeSession(sessionId: string): ConversationMemory {
  let memory = memoryStore.get(sessionId);
  
  if (!memory) {
    memory = {
      sessionId,
      messages: [],
      userPreferences: {},
    };
    memoryStore.set(sessionId, memory);
  }
  
  return memory;
}
