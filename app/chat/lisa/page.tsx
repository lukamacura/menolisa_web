/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Menu,
  Plus,
  Send,
  Trash,
  Trash2,
  X,
  Rocket,
  User,
  Copy,
  Check,
  Link as LinkIcon,
  Quote,
  MessageSquare,
  History,
  Sparkles,
} from "lucide-react";
import CoffeeLoading from "@/components/CoffeeLoading";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTrialStatus } from "@/lib/useTrialStatus";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ===== Theme (matching app pink/purple theme, optimized for 40+ vision) ===== */
const THEME = {
  pink: {
    50: "#FDF2F8",   // Very light pink
    100: "#FCE7F3",  // Light pink (matches app background)
    200: "#FBCFE8",  // Lighter pink
    300: "#F9A8D4",  // Medium light pink
    400: "#F472B6",  // Medium pink (matches app primary)
    500: "#EC4899",  // Standard pink
    600: "#DB2777",  // Darker pink
    700: "#BE185D",  // Dark pink
    800: "#9F1239",  // Very dark pink
  },
  purple: {
    100: "#F3E8FF",  // Very light purple
    200: "#E9D5FF",  // Light purple
    300: "#D8B4FE",  // Medium light purple
    400: "#C084FC",  // Medium purple
    500: "#A855F7",  // Standard purple
    600: "#9333EA",  // Darker purple
    700: "#7E22CE",  // Dark purple
  },
  fuchsia: {
    100: "#FDF4FF",
    200: "#FAE8FF",
    300: "#F5D0FE",
    400: "#F0ABFC",
    500: "#E879F9",
    600: "#D946EF",
  },
  rose: {
    50: "#FFF1F2",
    100: "#FFE4E6",
    200: "#FECDD3",
    300: "#FDA4AF",
    400: "#FB7185",
    500: "#F43F5E",
    600: "#E11D48",
    700: "#BE123C",
  },
  text: {
    900: "#1F2937",  // High contrast dark text
    800: "#374151",  // Dark text
    700: "#4B5563",  // Medium dark text
    600: "#6B7280",  // Medium text
    500: "#9CA3AF",  // Light text for placeholders
  },
  background: {
    light: "#FDF2F8",  // Matches app background #ffe9ef
    white: "#FFFFFF",
  },
} as const;

/* ===== Types & Keys ===== */
type FollowUpLink = {
  persona: string;
  topic: string;
  subtopic: string;
  label: string;
};

type Msg = { 
  role: "user" | "assistant"; 
  content: string; 
  ts?: number; 
  isGreeting?: boolean;
  follow_up_links?: FollowUpLink[];
};
type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
};

type ToastNotification = {
  id: string;
  title: string;
  message: string;
  timestamp: number;
};

// Removed localStorage keys - now using Supabase for persistence
const DATE_LOCALE = "en-US";
const MAX_MESSAGES_PER_SESSION = 50; // Limit for efficiency


/* ===== Utils ===== */
function splitByFences(src: string) {
  const parts: { code: boolean; text: string }[] = [];
  let i = 0;
  const fence = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (m.index > i) parts.push({ code: false, text: src.slice(i, m.index) });
    parts.push({ code: true, text: m[0] });
    i = m.index + m[0].length;
  }
  if (i < src.length) parts.push({ code: false, text: src.slice(i) });
  return parts;
}

/** Robustly convert "markdown-looking" / HTML-ish text into real Markdown. */
function normalizeMarkdown(src: string): string {
  if (!src) return "";
  let s = src.replace(/\r\n?/g, "\n");

  // Unwrap single full-message fences like ```md ... ```
  s = s.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1");

  // Remove zero-width & NBSP
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\u00A0/g, " ");

  // Process non-code chunks for HTML-y artifacts
  const parts = splitByFences(s).map(({ code, text }) => {
    if (code) return { code, text };

    let t = text;

    // Basic HTML list to Markdown
    t = t
      .replace(/<\/li>\s*/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

    // Paragraph-like tags → blank lines
    t = t.replace(/<\/?(p|div)[^>]*>/gi, "\n\n");

    // Strip other small tags but keep <br>
    t = t.replace(/<(?!br\s*\/?>)[^>\n]{1,60}>/gi, "");

    // Clean " |  " separators inside bullet content
    t = t.replace(/^(\s*[-*]\s+.*)$/gm, (line) =>
      line.replace(/\s*\|\s*\|\s*/g, " - ").replace(/\s\|\s/g, " - "),
    );

    // Normalize ATX headings & ensure blank line before
    t = t.replace(
      /^[\t ]*(#{1,6})([ \t]+)([^\n]+)$/gm,
      (_m, hashes, _sp, txt) => `${hashes} ${txt.trim()}`,
    );
    t = t.replace(/([^\n])\n(#{1,6}\s+)/g, "$1\n\n$2");

    // Convert setext to ATX
    t = t.replace(/^([^\n]+)\n[=]{3,}\s*$/gm, (_m, tt) => `# ${tt.trim()}`);
    t = t.replace(/^([^\n]+)\n[-]{3,}\s*$/gm, (_m, tt) => `## ${tt.trim()}`);

    // Prevent accidental 4-space code blocks
    t = t.replace(/^\s{4}([^\n]+)/gm, (_m, line) => line);

    // Collapse excessive blank lines
    t = t.replace(/\n{3,}/g, "\n\n");

    return { code, text: t };
  });

  s = parts.map((p) => p.text).join("");
  return s.trim();
}

// ID helper
const uid = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

/** Build a compact history of previous turns (NOT including the current user message). */
function buildHistory(messages: Msg[], maxChars = 4000): string {
  const lines = messages.map(
    (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`,
  );
  const acc: string[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (total + line.length + 1 > maxChars) break;
    acc.push(line);
    total += line.length + 1;
  }
  return acc.reverse().join("\n");
}

/* ===================== */
/*   Markdown Styling    */
/* ===================== */

// Allow only <br> HTML via rehype-raw + sanitize
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "br"],
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch { }
      }}
      className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-lg border-2 bg-white px-3 py-2 text-sm font-semibold shadow-md transition-all hover:bg-primary-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      style={{ borderColor: THEME.pink[300], color: THEME.text[800] }}
      aria-label="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}{" "}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Enhanced markdown renderer with support for headings, dividers, blockquotes, tables, bold, italic
function renderMarkdownText(text: string) {
  if (!text) return null;

  // Split text into blocks (paragraphs, headings, dividers, blockquotes, tables, lists)
  const blocks: Array<{ type: string; content: string; listType?: 'ul' | 'ol' }> = [];
  const lines = text.split('\n');
  let currentBlock: { type: string; content: string; listType?: 'ul' | 'ol' } | null = null;
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      if (inList && listItems.length > 0) {
        blocks.push({ type: listType === 'ol' ? 'ol' : 'ul', content: listItems.join('\n') });
        listItems = [];
        inList = false;
        listType = null;
      }
      blocks.push({ type: 'hr', content: '' });
      return;
    }

    // Check for headings (h1-h5)
    const headingMatch = trimmed.match(/^(#{1,5})\s+(.+)$/);
    if (headingMatch) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      if (inList && listItems.length > 0) {
        blocks.push({ type: listType === 'ol' ? 'ol' : 'ul', content: listItems.join('\n') });
        listItems = [];
        inList = false;
        listType = null;
      }
      blocks.push({ type: `h${headingMatch[1].length}`, content: headingMatch[2] });
      return;
    }

    // Check for ordered list (1. or 1) or emoji numbers (1️⃣, 2️⃣, etc.) or unordered list (-, *, •)
    const orderedListMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    const emojiNumberMatch = trimmed.match(/^([1-9]️⃣)\s+(.+)$/);
    const unorderedListMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    
    if (orderedListMatch || emojiNumberMatch || unorderedListMatch) {
      const detectedType = (orderedListMatch || emojiNumberMatch) ? 'ol' : 'ul';
      const itemContent = orderedListMatch ? orderedListMatch[2] : emojiNumberMatch ? emojiNumberMatch[2] : unorderedListMatch![1];
      
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      
      if (inList && listType === detectedType) {
        // Continue same list
        listItems.push(itemContent);
      } else {
        // Start new list (different type or first list)
        if (inList && listItems.length > 0) {
          blocks.push({ type: listType === 'ol' ? 'ol' : 'ul', content: listItems.join('\n') });
          listItems = [];
        }
        inList = true;
        listType = detectedType;
        listItems.push(itemContent);
      }
      return;
    } else if (!trimmed && inList) {
      // Blank line within list - continue the list (don't end it yet)
      return;
    } else if (inList && listItems.length > 0) {
      // End of list (non-list content encountered)
      blocks.push({ type: listType === 'ol' ? 'ol' : 'ul', content: listItems.join('\n') });
      listItems = [];
      inList = false;
      listType = null;
    }

    // Check for blockquote
    if (trimmed.startsWith('> ')) {
      if (currentBlock?.type !== 'blockquote') {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'blockquote', content: trimmed.slice(2) };
      } else {
        currentBlock.content += '\n' + trimmed.slice(2);
      }
      return;
    }

    // Check for table
    if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
      if (!inTable) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        inTable = true;
        tableRows = [];
      }
      // Skip separator row (|---|---|)
      if (!/^[\s|:\-]+$/.test(trimmed)) {
        tableRows.push(trimmed);
      }
      return;
    } else {
      if (inTable && tableRows.length > 0) {
        blocks.push({ type: 'table', content: tableRows.join('\n') });
        tableRows = [];
        inTable = false;
      }
    }

    // Regular paragraph
    if (trimmed) {
      if (currentBlock?.type !== 'paragraph') {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'paragraph', content: trimmed };
      } else {
        currentBlock.content += '\n' + trimmed;
      }
    } else {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    }
  });

  // Add remaining blocks
  if (inTable && tableRows.length > 0) {
    blocks.push({ type: 'table', content: tableRows.join('\n') });
  }
  if (inList && listItems.length > 0) {
    blocks.push({ type: listType === 'ol' ? 'ol' : 'ul', content: listItems.join('\n') });
  }
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // Render blocks
  return (
    <>
      {blocks.map((block, blockIdx) => {
        if (block.type === 'hr') {
          return (
            <div key={`hr-${blockIdx}`} style={{ margin: '2.5rem 0', position: 'relative' }}>
              <div
                style={{
                  height: '2px',
                  background: `linear-gradient(to right, transparent, ${THEME.pink[300]}, ${THEME.pink[400]}, ${THEME.pink[300]}, transparent)`,
                  borderRadius: '2px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: THEME.pink[400],
                    boxShadow: `0 0 8px ${THEME.pink[300]}`,
                  }}
                />
              </div>
            </div>
          );
        }

        if (block.type.startsWith('h')) {
          const level = parseInt(block.type[1]);
          const config = {
            1: { size: '2.75rem', weight: 800, margin: '2rem 0 1rem', color: THEME.pink[600], letterSpacing: '-0.03em' },
            2: { size: '2.25rem', weight: 700, margin: '1.75rem 0 0.875rem', color: THEME.pink[600], letterSpacing: '-0.025em' },
            3: { size: '1.75rem', weight: 700, margin: '1.5rem 0 0.75rem', color: THEME.text[900], letterSpacing: '-0.02em' },
            4: { size: '1.5rem', weight: 600, margin: '1.25rem 0 0.625rem', color: THEME.text[900], letterSpacing: '-0.015em' },
            5: { size: '1.25rem', weight: 600, margin: '1rem 0 0.5rem', color: THEME.text[800], letterSpacing: '-0.01em' },
          };
          const style = config[level as keyof typeof config] || config[3];

          return (
            <div
              key={`${block.type}-${blockIdx}`}
              style={{
                fontSize: style.size,
                fontWeight: style.weight,
                color: style.color,
                margin: style.margin,
                lineHeight: '1.2',
                letterSpacing: style.letterSpacing,
                position: 'relative',
                paddingLeft: level <= 2 ? '0' : '0',
              }}
            >
              {level <= 2 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '-1.5rem',
                    top: '0.5rem',
                    width: '4px',
                    height: 'calc(100% - 1rem)',
                    background: `linear-gradient(to bottom, ${THEME.pink[400]}, ${THEME.pink[500]})`,
                    borderRadius: '2px',
                  }}
                />
              )}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {renderInlineMarkdown(block.content)}
              </div>
            </div>
          );
        }

        if (block.type === 'blockquote') {
          // Remove any legacy markers from content
          let cleanContent = block.content.replace(/\[HABIT_STRATEGY\]\s*/g, '');
          cleanContent = cleanContent.replace(/\[MOTIVATION_NUDGE\]\s*/g, '');
          
          // Standard theme for all blockquotes - normal foreground color
          const theme = {
            border: THEME.pink[400],
            bgStart: THEME.pink[50],
            bgEnd: THEME.pink[100],
            shadow: 'rgba(236, 72, 153, 0.1)',
            quote: THEME.pink[300],
            text: THEME.text[800],  // Normal foreground color
          };
          
          return (
            <blockquote
              key={`blockquote-${blockIdx}`}
              style={{
                borderLeft: `4px solid ${theme.border}`,
                margin: '1.5rem 0',
                padding: '1.25rem 1.5rem',
                fontStyle: 'italic',
                color: theme.text,
                background: `linear-gradient(to right, ${theme.bgStart}, ${theme.bgEnd})`,
                borderRadius: '0.75rem',
                boxShadow: `0 2px 8px ${theme.shadow}`,
                position: 'relative',
                fontSize: '1.125rem',
                lineHeight: '1.6',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '1rem',
                  left: '1.5rem',
                  fontSize: '2rem',
                  color: theme.quote,
                  opacity: 0.5,
                  fontFamily: 'Georgia, serif',
                }}
              >
                &ldquo;
              </div>
              <div style={{ paddingLeft: '1.5rem' }}>
                {cleanContent.split('\n').map((line, lineIdx) => {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) return null;
                  return (
                    <div key={lineIdx} style={{ marginBottom: lineIdx < cleanContent.split('\n').length - 1 ? '0.5rem' : '0' }}>
                      {renderInlineMarkdown(trimmedLine)}
                    </div>
                  );
                })}
              </div>
            </blockquote>
          );
        }

        if (block.type === 'ul' || block.type === 'ol') {
          // Split by newline and filter out empty items, preserving order
          const rawItems = block.content.split('\n');
          const items = rawItems.filter(item => item && item.trim().length > 0).map(item => item.trim());
          const isOrdered = block.type === 'ol';

          if (items.length === 0) {
            return null;
          }

          return (
            <div
              key={`${block.type}-${blockIdx}`}
              style={{
                margin: '1.25rem 0',
                paddingLeft: '0',
              }}
            >
              {isOrdered ? (
                <ol
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {items.map((item, itemIdx) => {
                    // Calculate the correct sequential number (1, 2, 3, etc.)
                    // itemIdx is 0-based, so add 1 to get 1, 2, 3...
                    const itemNumber = itemIdx + 1;
                    return (
                      <li
                        key={`${blockIdx}-ol-${itemIdx}`}
                        style={{
                          position: 'relative',
                          paddingLeft: '2.75rem',
                          marginBottom: '1rem',
                          fontSize: '1.125rem',
                          lineHeight: '1.7',
                          color: THEME.text[900],
                          transition: 'transform 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: '0',
                            top: '0.125rem',
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '0.625rem',
                            background: `linear-gradient(135deg, ${THEME.pink[400]}, ${THEME.pink[500]}, ${THEME.purple[300]})`,
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.9375rem',
                            fontWeight: 800,
                            boxShadow: `0 4px 12px rgba(236, 72, 153, 0.35), 0 2px 4px rgba(216, 180, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
                            border: `1.5px solid rgba(255, 255, 255, 0.4)`,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1) rotate(2deg)';
                            e.currentTarget.style.boxShadow = `0 6px 16px rgba(236, 72, 153, 0.45), 0 3px 6px rgba(216, 180, 254, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.5)`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
                            e.currentTarget.style.boxShadow = `0 4px 12px rgba(236, 72, 153, 0.35), 0 2px 4px rgba(216, 180, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)`;
                          }}
                        >
                          {itemNumber}
                        </span>
                        <div style={{ paddingTop: '0.25rem' }}>
                          {renderInlineMarkdown(item)}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {items.map((item, itemIdx) => (
                    <li
                      key={itemIdx}
                      style={{
                        position: 'relative',
                        paddingLeft: '2rem',
                        marginBottom: '0.875rem',
                        fontSize: '1.125rem',
                        lineHeight: '1.6',
                        color: THEME.text[900],
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: '0.375rem',
                          top: '0.75rem',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${THEME.pink[400]}, ${THEME.pink[500]})`,
                          boxShadow: `0 2px 4px rgba(236, 72, 153, 0.3)`,
                        }}
                      />
                      <div style={{ paddingTop: '0.125rem' }}>
                        {renderInlineMarkdown(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }

        if (block.type === 'table') {
          const rows = block.content.split('\n').filter(r => r.trim());
          if (rows.length === 0) return null;

          const headerRow = rows[0].split('|').map(c => c.trim()).filter(c => c);
          const dataRows = rows.slice(1).map(row =>
            row.split('|').map(c => c.trim()).filter(c => c)
          );

          return (
            <div
              key={`table-${blockIdx}`}
              style={{
                margin: '1.5rem 0',
                overflowX: 'auto',
                borderRadius: '1rem',
                border: `2px solid ${THEME.pink[200]}`,
                overflow: 'hidden',
                boxShadow: `0 4px 12px rgba(236, 72, 153, 0.1)`,
                background: 'white',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      background: `linear-gradient(135deg, ${THEME.pink[100]}, ${THEME.pink[200]})`,
                    }}
                  >
                    {headerRow.map((cell, cellIdx) => (
                      <th
                        key={cellIdx}
                        style={{
                          padding: '1rem 1.25rem',
                          textAlign: 'left',
                          fontWeight: 700,
                          color: THEME.text[900],
                          borderBottom: `3px solid ${THEME.pink[400]}`,
                          fontSize: '1rem',
                          letterSpacing: '0.01em',
                        }}
                      >
                        {renderInlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      style={{
                        background: rowIdx % 2 === 0 ? 'white' : THEME.pink[50],
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          style={{
                            padding: '0.875rem 1.25rem',
                            borderBottom: `1px solid ${THEME.pink[200]}`,
                            color: THEME.text[800],
                            fontSize: '1rem',
                            lineHeight: '1.5',
                          }}
                        >
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Regular paragraph
        return (
          <p
            key={`para-${blockIdx}`}
            style={{
              marginBottom: blockIdx < blocks.length - 1 ? '1.5rem' : '0',
              fontSize: '1.125rem',
              lineHeight: '1.7',
              color: THEME.text[900],
              fontWeight: 500,
              letterSpacing: '0.01em',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}
          >
            {renderInlineMarkdown(block.content)}
          </p>
        );
      })}
    </>
  );
}

// Helper function to render inline markdown (bold, italic) within text
function renderInlineMarkdown(text: string) {
  if (!text) return null;

  const parts: (string | React.ReactElement)[] = [];
  let currentIndex = 0;
  let keyCounter = 0;

  // Match **bold**, *italic*, and ~~strikethrough~~
  // First collect all bold matches to exclude them from italic matching
  const boldMatches: Array<{ start: number; end: number }> = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let boldMatch;
  while ((boldMatch = boldRegex.exec(text)) !== null) {
    boldMatches.push({ start: boldMatch.index, end: boldMatch.index + boldMatch[0].length });
  }

  // Collect strikethrough matches
  const strikethroughMatches: Array<{ start: number; end: number }> = [];
  const strikethroughRegex = /~~(.+?)~~/g;
  let strikethroughMatch;
  while ((strikethroughMatch = strikethroughRegex.exec(text)) !== null) {
    strikethroughMatches.push({ start: strikethroughMatch.index, end: strikethroughMatch.index + strikethroughMatch[0].length });
  }

  const matches: Array<{ start: number; end: number; content: string; type: string }> = [];

  // Add bold matches
  boldMatches.forEach(({ start, end }) => {
    const content = text.slice(start + 2, end - 2);
    matches.push({ start, end, content, type: 'bold' });
  });

  // Add strikethrough matches
  strikethroughMatches.forEach(({ start, end }) => {
    const content = text.slice(start + 2, end - 2);
    matches.push({ start, end, content, type: 'strikethrough' });
  });

  // Add italic matches, but exclude those that overlap with bold or strikethrough
  const italicRegex = /\*([^*]+?)\*/g;
  let italicMatch;
  while ((italicMatch = italicRegex.exec(text)) !== null) {
    const start = italicMatch.index;
    const end = start + italicMatch[0].length;
    // Check if this italic match overlaps with any bold or strikethrough match
    const overlaps = boldMatches.some(bm =>
      (start >= bm.start && start < bm.end) ||
      (end > bm.start && end <= bm.end) ||
      (start <= bm.start && end >= bm.end)
    ) || strikethroughMatches.some(sm =>
      (start >= sm.start && start < sm.end) ||
      (end > sm.start && end <= sm.end) ||
      (start <= sm.start && end >= sm.end)
    );
    if (!overlaps) {
      matches.push({ start, end, content: italicMatch[1], type: 'italic' });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  matches.forEach((match) => {
    if (match.start > currentIndex) {
      const beforeText = text.slice(currentIndex, match.start);
      if (beforeText) {
        parts.push(beforeText);
      }
    }

    if (match.type === 'bold') {
      parts.push(
        <strong key={`bold-${keyCounter++}`} style={{ fontWeight: 700, color: THEME.text[900] }}>
          {match.content}
        </strong>
      );
    } else if (match.type === 'italic') {
      parts.push(
        <em key={`italic-${keyCounter++}`} style={{ fontStyle: 'italic' }}>
          {match.content}
        </em>
      );
    } else if (match.type === 'strikethrough') {
      parts.push(
        <del key={`strikethrough-${keyCounter++}`} style={{ textDecoration: 'line-through', opacity: 0.7 }}>
          {match.content}
        </del>
      );
    }

    currentIndex = match.end;
  });

  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex));
  }

  if (parts.length === 0) {
    return text;
  }

  return <>{parts}</>;
}

const MarkdownBubble = React.memo(function MarkdownBubble({ children }: { children: string }) {
  const text = useMemo(() => normalizeMarkdown(children), [children]);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const strip = (props: any) => {
    const { ...rest } = props || {};
    return rest;
  };

  const bubbleMotionProps = prefersReduced
    ? {}
    : {
      initial: { opacity: 0, y: 10, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: { duration: 0.7 },
    };

  return (
    <motion.div
      {...bubbleMotionProps}
      className="prose prose-slate max-w-none prose-xl md:prose-2xl prose-headings:font-bold prose-p:my-5 prose-p:text-xl prose-p:leading-loose prose-strong:font-bold prose-a:no-underline prose-a:font-semibold prose-li:my-3 prose-li:text-xl prose-blockquote:font-normal prose-img:my-5 prose-h1:text-4xl md:prose-h1:text-6xl prose-h2:text-3xl prose-h3:text-2xl"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        skipHtml={false}
        components={{
          h1(p: any) {
            const { children, ...rest } = p;
            return (
              <h1
                {...strip(rest)}
                className="mt-1 mb-5 flex items-center gap-3 text-5xl font-extrabold tracking-tight md:text-6xl"
                style={{ color: THEME.pink[600] }}
              >
                {children}
              </h1>
            );
          },
          h2(p: any) {
            const { children, ...rest } = p;
            return (
              <h2
                {...strip(rest)}
                className="mt-7 mb-4 flex items-center gap-3 text-4xl font-bold"
                style={{ color: THEME.text[900] }}
              >
                <span className="inline-block h-6 w-1.5 rounded-full" style={{ backgroundColor: THEME.pink[400] }} />
                {children}
              </h2>
            );
          },
          h3(p: any) {
            const { children, ...rest } = p;
            return (
              <h3
                {...strip(rest)}
                className="mt-4 mb-3 text-2xl font-bold"
                style={{ color: THEME.text[900] }}
              >
                {children}
              </h3>
            );
          },
          h4(p: any) {
            const { children, ...rest } = p;
            return (
              <h4
                {...strip(rest)}
                className="mt-3 mb-2 text-xl font-semibold"
                style={{ color: THEME.text[900] }}
              >
                {children}
              </h4>
            );
          },
          h5(p: any) {
            const { children, ...rest } = p;
            return (
              <h5
                {...strip(rest)}
                className="mt-3 mb-2 text-lg font-semibold"
                style={{ color: THEME.text[800] }}
              >
                {children}
              </h5>
            );
          },
          p(p: any) {
            const { children, ...rest } = p;
            return (
              <p
                {...strip(rest)}
                className="my-2 text-base leading-relaxed text-slate-800/95"
                style={{ lineHeight: '1.4' }}
              >
                {children}
              </p>
            );
          },
          hr() {
            return (
              <hr className="my-4 h-0.5 border-0 bg-linear-to-r from-transparent via-[#B7A3DE]/60 to-transparent" />
            );
          },
          a(p: any) {
            const { children, ...rest } = p;
            return (
              <a
                {...strip(rest)}
                className="group inline-flex items-center gap-1 underline decoration-2 decoration-dotted underline-offset-[5px] text-[#57407F] hover:underline-offset-[7px]"
                target="_blank"
                rel="noreferrer noopener"
              >
                <LinkIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:scale-110" />
                {children}
              </a>
            );
          },
          ul(p: any) {
            const { children, ...rest } = p;
            return (
              <ul {...strip(rest)} className="my-4 space-y-2 pl-5">
                {children}
              </ul>
            );
          },
          ol(p: any) {
            const { children, ...rest } = p;
            return (
              <ol
                {...strip(rest)}
                className="my-4 list-decimal space-y-2 pl-6"
              >
                {children}
              </ol>
            );
          },
          li(p: any) {
            const { children, ...rest } = p;
            return (
              <li {...strip(rest)} className="relative pl-7">
                <span className="absolute left-0 top-3 h-2 w-2 rounded-full bg-[#927DC7]/60" />
                {children}
              </li>
            );
          },
          blockquote(p: any) {
            const first =
              typeof p?.children?.[0] === "string"
                ? (p.children[0] as string)
                : "";
            const m = first.match(/^\s*\[\!(tip|note|caution)\]\s*/i);

            if (!m) {
              return (
                <blockquote className="my-4 rounded-xl border-l-4 p-3 text-base" style={{ borderColor: THEME.pink[400], backgroundColor: THEME.pink[50], color: THEME.text[800], lineHeight: '1.4' }}>
                  {p.children}
                </blockquote>
              );
            }

            const kind = m[1].toLowerCase() as "tip" | "note" | "caution";

            const colorMap: Record<
              "tip" | "note" | "caution",
              { ring: string; bg: string; text: string; title: string }
            > = {
              tip: {
                ring: "#4E9A92",
                bg: "#F1FAF8",
                text: "#155E54",
                title: "Tip",
              },
              note: {
                ring: "#927DC7",
                bg: "#F7F3FB",
                text: "#57407F",
                title: "Note",
              },
              caution: {
                ring: "#F59E0B",
                bg: "#FFF7ED",
                text: "#7C2D12",
                title: "Caution",
              },
            };

            const colors = colorMap[kind] ?? colorMap.note;

            const cleaned = Array.isArray(p.children)
              ? p.children.map((ch: any, i: number) =>
                typeof ch === "string" && i === 0
                  ? ch.replace(/^\s*\[\!(tip|note|caution)\]\s*/i, "")
                  : ch,
              )
              : p.children;

            return (
              <blockquote
                className="my-3 rounded-xl border-l-4 p-3"
                style={{
                  borderColor: colors.ring,
                  backgroundColor: colors.bg,
                  color: colors.text,
                  lineHeight: '1.4',
                }}
              >
                <div className="mb-1 flex items-center gap-2 font-medium text-sm">
                  <Quote className="h-4 w-4" /> {colors.title}
                </div>
                <div className="text-slate-800/90 text-base">{cleaned}</div>
              </blockquote>
            );
          },
          table(p: any) {
            const { children, ...rest } = p;
            return (
              <div className="my-4 overflow-hidden rounded-xl border-2 bg-white shadow-md" style={{ borderColor: THEME.pink[200] }}>
                <table {...strip(rest)} className="w-full text-base">
                  {children}
                </table>
              </div>
            );
          },
          thead(p: any) {
            const { children, ...rest } = p;
            return (
              <thead {...strip(rest)} className="font-semibold" style={{ backgroundColor: THEME.pink[100], color: THEME.text[800] }}>
                {children}
              </thead>
            );
          },
          th(p: any) {
            const { children, ...rest } = p;
            return (
              <th
                {...strip(rest)}
                className="px-4 py-2 text-left text-sm font-bold uppercase tracking-wide"
                style={{ color: THEME.text[700] }}
              >
                {children}
              </th>
            );
          },
          td(p: any) {
            const { children, ...rest } = p;
            return (
              <td
                {...strip(rest)}
                className="border-t px-4 py-2 text-base"
                style={{ borderColor: THEME.pink[200], color: THEME.text[900] }}
              >
                {children}
              </td>
            );
          },
          img(p: any) {
            const { alt, ...rest } = p;
            return (
              <div className="my-3 overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: THEME.pink[200] }}>
                <Image
                  {...strip(rest)}
                  alt={alt ?? ""}
                  className="mx-auto block h-auto max-h-80 w-full max-w-full object-contain"
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
                {alt && (
                  <div className="px-3 pb-2 pt-1.5 text-center text-sm font-semibold" style={{ color: THEME.text[600] }}>
                    {alt}
                  </div>
                )}
              </div>
            );
          },
          code(p: any) {
            const { inline, className, children, ...rest } = p;
            const txt = String(children ?? "");
            const match = /language-([\w-]+)/.exec(className || "");
            const language = match?.[1];

            if (inline) {
              return (
                <code
                  {...strip(rest)}
                  className="rounded-md px-2 py-1 text-sm font-mono"
                  style={{ backgroundColor: THEME.pink[100], color: THEME.text[900] }}
                >
                  {txt}
                </code>
              );
            }

            return (
              <pre className="relative my-3 overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: THEME.pink[200] }}>
                <div className="flex items-center justify-between border-b-2 px-3 py-2 text-xs uppercase tracking-wide font-semibold" style={{ borderColor: THEME.pink[200], backgroundColor: THEME.pink[100], color: THEME.text[700] }}>
                  <span>{language || "code"}</span>
                </div>
                <div className="relative">
                  <CopyButton text={txt} />
                  <code
                    {...strip(rest)}
                    className="block min-w-full whitespace-pre px-3 pb-3 pt-2 font-mono text-[13px] leading-6"
                  >
                    {txt}
                  </code>
                </div>
              </pre>
            );
          },
          del(p: any) {
            const { children, ...rest } = p;
            return (
              <del
                {...strip(rest)}
                style={{ textDecoration: 'line-through', opacity: 0.7 }}
              >
                {children}
              </del>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </motion.div>
  );
});

/* ===== Supabase session types ===== */
type SessionFromDB = {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

type MessageFromDB = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};


/* ===== Toast Notification Component ===== */
function ToastNotificationComponent({ notification, onDismiss }: { notification: ToastNotification; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 4000); // Auto-dismiss after 4 seconds

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-2 sm:px-4"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="rounded-2xl shadow-xl border-2 px-3 py-3 sm:px-4 sm:py-4 bg-card border-fuchsia-200 backdrop-blur-lg flex flex-col"

      >
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-fuchsia-100 ring-2 ring-fuchsia-200">
            <Sparkles className="h-5 w-5 text-fuchsia-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base sm:text-sm text-fuchsia-900" style={{ color: THEME.text[900] }}>
              {notification.title}
            </div>
            <div className="text-sm mt-1 text-fuchsia-800" style={{ color: THEME.text[700] }}>
              {notification.message}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 p-2 sm:p-1 rounded-full hover:bg-fuchsia-100 transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
            aria-label="Dismiss notification"
          >
            <X className="h-5 w-5 text-fuchsia-500" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const CHAT_VIDEO_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='12' viewBox='0 0 16 12'%3E%3Crect fill='%23f9a8d4' width='16' height='12'/%3E%3C/svg%3E";

function ChatPageInner() {
  const router = useRouter();
  const trialStatus = useTrialStatus();
  const isMobile = useIsMobile();
  const videoPreload = isMobile ? "none" : "metadata";

  // Redirect to dashboard if trial is expired
  useEffect(() => {
    if (!trialStatus.loading && trialStatus.expired) {
      router.replace("/dashboard");
    }
  }, [trialStatus.expired, trialStatus.loading, router]);

  /* ---- State ---- */
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  // ✅ auth user id (no localStorage)
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Handle URL prompt parameter (for "Ask Lisa" button from tracker)
  // NOTE: This useEffect is moved below sendToAPI definition to avoid TDZ error
  const searchParams = useSearchParams();
  const promptHandledRef = useRef<string | null>(null);

  // Chat list refs (auto-scroll)
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didInitRef = useRef(false);
  const [stickToBottom, setStickToBottom] = useState(true);



  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  /* ---- Fetch sessions from Supabase ---- */
  const fetchSessionsFromDB = useCallback(async (user_id: string) => {
    try {
      const res = await fetch(`/api/chat-sessions?user_id=${encodeURIComponent(user_id)}&limit=20`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      
      const dbSessions: SessionFromDB[] = data.sessions || [];
      
      // Convert DB sessions to local Conversation format (without messages yet - lazy load)
      const conversations: Conversation[] = dbSessions.map((s) => ({
        id: s.session_id,
        title: s.title || "Menopause Support Chat",
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
        messages: [], // Will be loaded when session is opened
      }));
      
      return conversations;
    } catch (error) {
      console.error("Error fetching sessions:", error);
      return [];
    }
  }, []);

  /* ---- Fetch messages for a session ---- */
  const fetchMessagesForSession = useCallback(async (user_id: string, session_id: string): Promise<Msg[]> => {
    try {
      const res = await fetch(
        `/api/chat-sessions?user_id=${encodeURIComponent(user_id)}&session_id=${encodeURIComponent(session_id)}&limit=${MAX_MESSAGES_PER_SESSION}`
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      
      const dbMessages: MessageFromDB[] = data.messages || [];
      
      // Convert to local Msg format
      return dbMessages.map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? normalizeMarkdown(m.content) : m.content,
        ts: new Date(m.created_at).getTime(),
      }));
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }, []);

  /* ---- Load sessions when userId is available ---- */
  useEffect(() => {
    if (!userId) return;
    
    let mounted = true;
    
    const loadSessions = async () => {
      setSessionsLoading(true);
      const loadedSessions = await fetchSessionsFromDB(userId);
      
      if (!mounted) return;
      
      if (loadedSessions.length > 0) {
        // Load messages for the most recent session
        const firstSession = loadedSessions[0];
        const messages = await fetchMessagesForSession(userId, firstSession.id);
        
        if (!mounted) return;
        
        // Update first session with messages
        loadedSessions[0] = { ...firstSession, messages };
        
        setSessions(loadedSessions);
        setActiveId(firstSession.id);
      }
      
      setSessionsLoading(false);
    };
    
    loadSessions();
    
    return () => {
      mounted = false;
    };
  }, [userId, fetchSessionsFromDB, fetchMessagesForSession]);

  /* ---- Auto-scroll behavior ---- */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 120;
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setStickToBottom(nearBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Don't auto-scroll during streaming - keep view at top of message
      if (stickToBottom && !isStreaming) {
        // Scroll to bottom to ensure full visibility
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stickToBottom, isStreaming]);

  useEffect(() => {
    // Don't auto-scroll during streaming - keep view at top of message
    if (stickToBottom && !isStreaming) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const el = listRef.current;
        if (el) {
          // Scroll to absolute bottom to ensure full visibility
          el.scrollTop = el.scrollHeight;
        }
      }, 100);
    }
  }, [sessions, activeId, loading, stickToBottom, isStreaming]);

  /* ---- Textarea autosize ---- */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!input || input.trim() === "") {
      // Reset to normal height when input is empty
      el.style.height = "64px";
    } else {
      el.style.height = "0px";
      el.style.height = Math.min(200, el.scrollHeight) + "px";
    }
  }, [input]);

  /* ---- Helpers ---- */
  const upsertAndAppendMessage = useCallback(
    (convId: string, msg: Msg, makeIfMissing?: () => Conversation) => {
      setSessions((prev) => {
        const i = prev.findIndex((c) => c.id === convId);
        if (i === -1) {
          const base =
            makeIfMissing?.() ?? {
              id: convId,
              title: "Menopause Support Chat",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: [],
            };
          const created: Conversation = {
            ...base,
            messages: [
              ...base.messages,
              { ...msg, ts: msg.ts ?? Date.now() },
            ],
            updatedAt: Date.now(),
          };
          return [created, ...prev];
        }
        const next = [...prev];
        const c = next[i];
        next[i] = {
          ...c,
          messages: [...c.messages, { ...msg, ts: msg.ts ?? Date.now() }],
          updatedAt: Date.now(),
          title:
            c.title === "Menopause Support Chat" &&
              msg.role === "user" &&
              msg.content
              ? msg.content.slice(0, 40)
              : c.title,
        };
        return next;
      });
    },
    [],
  );

  const newChat = useCallback(async (): Promise<string> => {
    const id = uid();
    const now = Date.now();

    // Welcome messages array
    const welcomeMessages = [
      "Hi there, (NAME)! How are you doing today?",
      "Hey, (NAME)! What can I help you with?",
      "Hey, (NAME)! What's going on?",
      "Hi, (NAME)! What would you like to talk about today?",
      "Hey there, (NAME)! What do you need today?",
      "Hi, (NAME)! How can I help?",
      "Hey, (NAME)! Good to hear from you. What's up?",
      "Hello, (NAME)! I'm here - what's on your mind?",
    ];

    // Get user's name
    let userName: string | null = null;
    if (userId) {
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("name")
          .eq("user_id", userId)
          .single();
        
        if (profile?.name) {
          // Extract first name from name field (could be full name or just first name)
          const nameParts = profile.name.trim().split(/\s+/);
          userName = nameParts[0] || profile.name;
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    }

    // Select random welcome message
    const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    
    // Replace (NAME) with actual name - if no name, use generic greetings without name
    let greeting: string;
    if (userName) {
      greeting = randomMessage.replace("(NAME)", userName);
    } else {
      // Use generic versions when no name is available
      const genericMessages = [
        "Hi there! How are you doing today?",
        "Hey! What can I help you with?",
        "Hey! What's going on?",
        "Hi! What would you like to talk about today?",
        "Hey there! What do you need today?",
        "Hi! How can I help?",
        "Hey! Good to hear from you. What's up?",
        "Hello! I'm here - what's on your mind?",
      ];
      // Use the same index as the selected message for consistency
      const messageIndex = welcomeMessages.indexOf(randomMessage);
      greeting = genericMessages[messageIndex] || genericMessages[0];
    }

    const conv: Conversation = {
      id,
      title: "Menopause Support Chat",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          role: "assistant",
          content: greeting,
          ts: now,
          isGreeting: true,
        },
      ],
    };
    setSessions((prev) => [conv, ...prev]);
    setActiveId(id);
    setMenuOpen(false);
    setInput("");
    setStickToBottom(true);
    return id;
  }, [userId]);

  const openChat = useCallback(async (id: string) => {
    setActiveId(id);
    setMenuOpen(false);
    setStickToBottom(true);
    
    // Lazy load messages if not already loaded
    const session = sessions.find((s) => s.id === id);
    if (session && session.messages.length === 0 && userId) {
      const messages = await fetchMessagesForSession(userId, id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, messages } : s))
      );
    }
  }, [sessions, userId, fetchMessagesForSession]);
  
  // Initialize with new chat if no sessions exist after loading completes
  useEffect(() => {
    if (didInitRef.current) return;
    if (sessionsLoading) return; // Wait for sessions to finish loading
    
    // Sessions loaded, check if we need to create a new one
    if (sessions.length === 0 && userId) {
      didInitRef.current = true;
      void newChat();
    } else if (sessions.length > 0) {
      didInitRef.current = true;
    }
  }, [sessions, sessionsLoading, userId, newChat]);

  /* ---- Delete session from Supabase ---- */
  const deleteSession = useCallback(async (sessionId: string) => {
    // Optimistically remove from local state
    setSessions((prev) => {
      const rest = prev.filter((x) => x.id !== sessionId);
      setActiveId((curr) => (curr === sessionId ? rest[0]?.id ?? null : curr));
      return rest;
    });

    // Delete from Supabase in background
    if (userId) {
      try {
        await fetch(
          `/api/chat-sessions?user_id=${encodeURIComponent(userId)}&session_id=${encodeURIComponent(sessionId)}`,
          { method: "DELETE" }
        );
      } catch (error) {
        console.error("Error deleting session:", error);
      }
    }
  }, [userId]);

  /* ---- Update session title in Supabase ---- */
  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    if (!userId) return;
    try {
      await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          title,
          action: "update_title",
        }),
      });
    } catch (error) {
      console.error("Error updating session title:", error);
    }
  }, [userId]);

  // Track previous titles to detect changes and sync to Supabase
  const prevTitlesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!userId || sessionsLoading) return;
    
    for (const session of sessions) {
      const prevTitle = prevTitlesRef.current.get(session.id);
      if (prevTitle !== undefined && prevTitle !== session.title && session.title !== "Menopause Support Chat") {
        // Title changed, sync to Supabase
        void updateSessionTitle(session.id, session.title);
      }
      prevTitlesRef.current.set(session.id, session.title);
    }
  }, [sessions, userId, sessionsLoading, updateSessionTitle]);

  // Helper function to add notification
  const addNotification = useCallback((title: string, message: string) => {
    const notification: ToastNotification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title,
      message,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [...prev, notification]);
  }, []);

  // Helper function to remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /* ---- API ---- */
  const sendToAPI = useCallback(
    async (text: string, targetId?: string) => {
      const id = targetId ?? activeId;
      if (!id) return;
      
      // Block sending if trial is expired
      if (trialStatus.expired) {
        addNotification("Trial Expired", "Your trial has expired. Please upgrade to continue using the chat.");
        router.push("/dashboard");
        return;
      }

      upsertAndAppendMessage(
        id,
        { role: "user", content: text },
        () => ({
          id,
          title: "Menopause Support Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            {
              role: "assistant",
              content: "Hey, it's Lisa",
              ts: Date.now(),
            },
          ],
        }),
      );

      setInput("");
      setLoading(true);
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingMessageId(id);
      setStickToBottom(true);

      // Create placeholder assistant message IMMEDIATELY so loading component shows right away
      upsertAndAppendMessage(id, {
        role: "assistant",
        content: "",
        ts: Date.now(),
      });

      try {
        const convo = sessions.find((s) => s.id === id);
        const priorMessages = convo?.messages ?? [];
        const history = buildHistory(priorMessages);

        // ✅ always use Supabase auth id
        let finalUserId = userId;
        if (!finalUserId) {
          const { data } = await supabase.auth.getUser();
          finalUserId = data.user?.id ?? null;
        }
        if (!finalUserId) throw new Error("User not authenticated.");

        const res = await fetch("/api/langchain-rag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: finalUserId,
            sessionId: id,
            userInput: text,
            history,
            stream: true, // Enable streaming
          }),
          cache: "no-store",
        });

        if (!res.ok) {
          const errorText = await res.text();
          let errorData: any = null;
          try {
            errorData = JSON.parse(errorText);
          } catch { }
          const msg =
            errorData?.error ||
            errorData?.message ||
            `${res.status} ${res.statusText}`;
          throw new Error(msg);
        }

        // Check if response is streaming (text/event-stream) or JSON
        const contentType = res.headers.get("content-type");

        if (contentType?.includes("text/event-stream")) {
          // Handle streaming response
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error("No response body");
          }

          // Streaming already set up above, just ensure content is empty
          setStreamingMessageId(id);
          setStreamingContent("");

          let buffer = "";
          let fullResponse = "";

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.trim() && line.startsWith("data: ")) {
                  try {
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    const data = JSON.parse(jsonStr);

                    // Handle tool_call events
                    if (data.type === "tool_call") {
                      // Tool call initiated - we can show a loading state if needed
                      // For now, we'll wait for tool_result to show notification
                    } 
                    // Handle tool_result events
                    else if (data.type === "tool_result" && data.success) {
                      // Show notification when tool execution succeeds
                      const toolName = data.tool_name;
                      const toolArgs = data.tool_args;
                      
                      let title = "";
                      let message = "";
                      
                      if (toolName === "log_symptom") {
                        title = "Symptom Logged";
                        // Format severity: capitalize first letter (mild -> Mild, moderate -> Moderate, severe -> Severe)
                        const severityLabel = toolArgs.severity 
                          ? toolArgs.severity.charAt(0).toUpperCase() + toolArgs.severity.slice(1)
                          : 'Unknown';
                        
                        // Build message with symptom name and severity
                        const messageParts = [`${toolArgs.name}`, `Severity: ${severityLabel}`];
                        
                        // Add triggers if they exist
                        if (toolArgs.triggers && Array.isArray(toolArgs.triggers) && toolArgs.triggers.length > 0) {
                          const triggersText = toolArgs.triggers.join(', ');
                          messageParts.push(`Triggers: ${triggersText}`);
                        }
                        
                        message = messageParts.join(' | ');
                      }
                      
                      if (title && message) {
                        addNotification(title, message);
                      }
                    }
                    // Handle chunk events
                    else if (data.type === "chunk" && data.content !== undefined) {
                      // Backend sends accumulated content, so use it directly
                      fullResponse = data.content;

                      // Use requestAnimationFrame for smoother updates with debouncing
                      if (typeof window !== 'undefined') {
                        requestAnimationFrame(() => {
                          setStreamingContent(fullResponse);
                          // Don't auto-scroll during streaming - keep view at top of message
                        });
                      }
                    }
                    // Handle follow_up_links
                    else if (data.type === "follow_up_links" && data.links) {
                      // Store follow_up_links to attach to message when done
                      setSessions((prev) => {
                        const updated = prev.map((s) => {
                          if (s.id === id) {
                            const msgs = [...s.messages];
                            const lastMsg = msgs[msgs.length - 1];
                            if (lastMsg && lastMsg.role === "assistant") {
                              msgs[msgs.length - 1] = { ...lastMsg, follow_up_links: data.links };
                            }
                            return { ...s, messages: msgs, updatedAt: Date.now() };
                          }
                          return s;
                        });
                        return updated;
                      });
                    } else if (data.type === "done") {
                      // Streaming complete
                      const reply = normalizeMarkdown(fullResponse);
                      setSessions((prev) => {
                        const updated = prev.map((s) => {
                          if (s.id === id) {
                            const msgs = [...s.messages];
                            const lastMsg = msgs[msgs.length - 1];
                            if (lastMsg && lastMsg.role === "assistant" && !lastMsg.content) {
                              msgs[msgs.length - 1] = { ...lastMsg, content: reply };
                            } else {
                              msgs.push({ role: "assistant", content: reply, ts: Date.now() });
                            }
                            return { ...s, messages: msgs, updatedAt: Date.now() };
                          }
                          return s;
                        });
                        return updated;
                      });
                      setStreamingContent("");
                      setStreamingMessageId(null);
                      setIsStreaming(false);
                      setLoading(false);
                      return;
                    } else if (data.type === "error") {
                      throw new Error(data.error || "Streaming error");
                    }
                  } catch (e) {
                    // Skip malformed JSON, but log for debugging
                    if (line.trim() !== "data: [DONE]" && !line.trim().startsWith(":")) {
                      console.warn("Error parsing SSE data:", e, "Line:", line);
                    }
                  }
                }
              }
            }

            // Fallback: if we didn't get a "done" message, save what we have
            if (fullResponse) {
              const reply = normalizeMarkdown(fullResponse);
              setSessions((prev) => {
                const updated = prev.map((s) => {
                  if (s.id === id) {
                    const msgs = [...s.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.role === "assistant" && !lastMsg.content) {
                      msgs[msgs.length - 1] = { ...lastMsg, content: reply };
                    } else {
                      msgs.push({ role: "assistant", content: reply, ts: Date.now() });
                    }
                    return { ...s, messages: msgs, updatedAt: Date.now() };
                  }
                  return s;
                });
                return updated;
              });
            }
          } catch (streamError: any) {
            console.error("Streaming error:", streamError);
            throw streamError;
          } finally {
            setStreamingContent("");
            setStreamingMessageId(null);
            setIsStreaming(false);
            setLoading(false);
          }
        } else {
          // Non-streaming response (fallback)
          const raw = await res.text();
          let data: any = null;
          try {
            data = JSON.parse(raw);
          } catch { }

          const rawReply: string =
            data?.reply ??
            data?.outputs?.output_0 ??
            data?.outputs?.output ??
            data?.outputs?.answer ??
            (data?.outputs
              ? (Object.values(data.outputs).find(
                (v: any) => typeof v === "string",
              ) as string)
              : "") ??
            "⚠️ Empty reply";

          const reply = normalizeMarkdown(rawReply);
          upsertAndAppendMessage(id, { role: "assistant", content: reply });
          setStreamingContent("");
          setStreamingMessageId(null);
          setIsStreaming(false);
          setLoading(false);
        }
      } catch (e: any) {
        const safeMsg = String(e?.message || "unknown error").replace(
          /<[^>]*>/g,
          "",
        );
        upsertAndAppendMessage(id, {
          role: "assistant",
          content: `Oops, something went wrong 🧠 - ${safeMsg}`,
        });
        setStreamingContent("");
        setStreamingMessageId(null);
        setIsStreaming(false);
        setLoading(false);
      }
    },
    [activeId, sessions, upsertAndAppendMessage, userId, addNotification, trialStatus.expired, router],
  );

  // Handle URL prompt parameter (for "Ask Lisa" button from tracker)
  // Moved here after sendToAPI definition to avoid temporal dead zone error
  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (prompt && activeId && !loading) {
      const promptKey = `${activeId}-${prompt}`;
      if (promptHandledRef.current !== promptKey) {
        promptHandledRef.current = promptKey;
        sendToAPI(decodeURIComponent(prompt), activeId);
        router.replace('/chat/lisa');
      }
    }
  }, [searchParams, activeId, loading, sendToAPI, router]);

  // Show loading or expired message
  if (trialStatus.loading || (sessionsLoading && userId)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: THEME.pink[500] }} />
          <p className="text-lg" style={{ color: THEME.text[700] }}>Loading your conversations...</p>
        </div>
      </div>
    );
  }

  if (trialStatus.expired) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="rounded-2xl border-2 p-8 shadow-lg" style={{ borderColor: THEME.pink[300], backgroundColor: THEME.background.white }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: THEME.text[900] }}>Trial Expired</h2>
            <p className="text-lg mb-6" style={{ color: THEME.text[700] }}>
              Your trial has expired. Please upgrade to continue using the chat feature.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: THEME.pink[500] }}
            >
              Go to My Overview
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- UI ---- */
  const SidebarContent = (
    <div className="flex h-full flex-col">

      <button
        onClick={() => {
          void newChat();
          if (window.innerWidth < 1024) {
            setMenuOpen(false);
          }
        }}
        className="btn-primary inline-flex mb-4 w-full cursor-pointer items-center justify-center gap-2 px-3 py-2 text-sm active:scale-[0.98] touch-manipulation shadow-md"
        title="New chat"
        aria-label="Start a new chat"
      >
        <Plus className="h-4 w-4" />
        <span>New Chat</span>
      </button>

      <h4 className="hidden lg:block mt-4 mb-2 px-3 text-sm font-bold" style={{ color: THEME.text[800] }}>
        History
      </h4>
      <nav className="space-y-2 overflow-y-auto overflow-x-hidden flex-1 pr-3 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {sessions.length === 0 && (
          <div className="px-5 py-7 text-center text-lg" style={{ color: THEME.text[600] }}>
            No conversations yet.
            <div className="mt-3 text-base">Start a new chat to begin!</div>
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group relative flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm transition-all active:scale-[0.98] touch-manipulation ${s.id === activeId
                ? "bg-primary-light shadow-sm"
                : "bg-white/60 active:bg-white/80 hover:bg-white/70"
              }`}
            onClick={() => {
              openChat(s.id);
              if (window.innerWidth < 1024) {
                setMenuOpen(false);
              }
            }}
            title="Open chat"
            role="button"
            aria-label={`Open chat: ${s.title || "Conversation"}`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-snug mb-0.5 line-clamp-2" style={{ color: THEME.text[900] }}>
                {s.title || "Conversation"}
              </div>
              <div className="text-xs" style={{ color: THEME.text[600] }}>
                {new Date(s.updatedAt).toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void deleteSession(s.id);
              }}
              className="cursor-pointer p-1.5 rounded-lg transition-all active:bg-red-100 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-300 touch-manipulation shrink-0"
              title="Delete chat"
              aria-label="Delete chat"
              style={{ color: THEME.text[700] }}
            >
              <Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Toast Notifications */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none" style={{ paddingTop: '1rem' }}>
        {notifications.map((notification) => (
          <ToastNotificationComponent
            key={notification.id}
            notification={notification}
            onDismiss={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: ${THEME.pink[100]};
          border-radius: 10px;
          margin: 8px 0;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, ${THEME.pink[400]}, ${THEME.pink[500]});
          border-radius: 10px;
          border: 2px solid ${THEME.pink[100]};
          transition: all 0.2s ease;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, ${THEME.pink[500]}, ${THEME.pink[600]});
        }
        /* Firefox */
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${THEME.pink[400]} ${THEME.pink[100]};
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.2; }
        }
        .streaming-cursor {
          animation: blink 1s ease-in-out infinite;
        }
        .streaming-content {
          transition: opacity 0.15s ease-in-out;
        }
        .streaming-text {
          animation: fadeIn 0.2s ease-in;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        #composer::placeholder {
          color: #9CA3AF;
          opacity: 1;
          line-height: 1.5;
          vertical-align: middle;
          font-weight: 500;
        }
        #composer {
          display: flex;
          align-items: center;
          border: 1px solid #FBCFE8;
          box-shadow: 0 2px 8px rgba(236, 72, 153, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        #composer:focus {
          outline: none;
          border-color: #F9A8D4;
          box-shadow: 0 2px 8px rgba(236, 72, 153, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 2px rgba(236, 72, 153, 0.15);
        }
      `}</style>
      <div
        className="flex h-screen w-full text-foreground transition-all duration-500 ease-in-out relative overflow-hidden"
        style={{
          color: THEME.text[900],
        }}
      >
        {/* Nature-inspired gradient background with texture */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 120% 80% at 20% 20%, rgba(255, 182, 193, 0.5) 0%, transparent 60%),
              radial-gradient(ellipse 100% 70% at 80% 60%, rgba(221, 160, 221, 0.4) 0%, transparent 60%),
              radial-gradient(ellipse 90% 60% at 50% 80%, rgba(255, 228, 225, 0.35) 0%, transparent 60%),
              radial-gradient(ellipse 70% 50% at 10% 50%, rgba(255, 192, 203, 0.3) 0%, transparent 50%),
              linear-gradient(135deg, 
                #FDF2F8 0%, 
                #FCE7F3 20%, 
                #F9E8FF 40%,
                #F3E8FF 60%, 
                #E9D5FF 80%, 
                #FDF4FF 100%
              )
            `,
          }}
        >
          {/* Grid texture overlay - like graph paper */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                linear-gradient(rgba(236, 72, 153, 0.2) 1px, transparent 1px),
                linear-gradient(90deg, rgba(236, 72, 153, 0.2) 1px, transparent 1px),
                radial-gradient(circle at 2px 2px, rgba(168, 85, 247, 0.15) 1px, transparent 0)
              `,
              backgroundSize: '40px 40px, 40px 40px, 20px 20px',
            }}
          />
          {/* Soft cloud-like shapes */}
          <div
            className="absolute top-0 left-0 w-full h-full opacity-25"
            style={{
              background: `
                radial-gradient(ellipse 900px 500px at 15% 15%, rgba(255, 182, 193, 0.45), transparent),
                radial-gradient(ellipse 700px 600px at 85% 35%, rgba(221, 160, 221, 0.35), transparent),
                radial-gradient(ellipse 800px 450px at 45% 75%, rgba(255, 228, 225, 0.35), transparent),
                radial-gradient(ellipse 600px 400px at 5% 50%, rgba(255, 192, 203, 0.3), transparent)
              `,
            }}
          />
        </div>
        <div className="relative z-10 flex h-full w-full">
          {/* Sidebar - Desktop */}
          <aside
            className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block"
            aria-label="Sidebar"
          >
            <div
              className="h-full rounded-none border-r border-foreground/10 p-4 shadow-sm backdrop-blur-md"
              style={{
                backgroundColor: `rgba(252, 231, 243, 0.85)`,
                backdropFilter: 'blur(10px)',
              }}
            >
              {SidebarContent}
            </div>
          </aside>

          {/* Mobile Sidebar Backdrop */}
          {menuOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Sidebar - Mobile (Toggleable) */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] lg:hidden transform transition-transform duration-300 ease-in-out ${menuOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            aria-label="Mobile Sidebar"
          >
            <div
              className="h-full border-r-2 p-3 sm:p-4 backdrop-blur-md"
              style={{
                backgroundColor: `rgba(255, 255, 255, 0.95)`,
                backdropFilter: 'blur(10px)',
                borderColor: THEME.pink[300],
                boxShadow: menuOpen ? "4px 0 24px rgba(0, 0, 0, 0.15)" : "none"
              }}
            >
              <div className="flex items-center justify-between mb-3 pb-3 border-b-2" style={{ borderColor: THEME.pink[200] }}>
                <h2 className="text-2xl font-bold" style={{ color: THEME.text[900] }}>History</h2>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="cursor-pointer p-3 rounded-lg transition-all hover:bg-primary-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="Close menu"
                  style={{ color: THEME.text[800] }}
                >
                  <X className="h-7 w-7" />
                </button>
              </div>
              {SidebarContent}
            </div>
          </aside>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col transition-all duration-500 ease-in-out lg:pl-72">
            {/* Top bar (mobile) */}
            <div className="fixed w-full z-100 top-0 flex items-center justify-between px-4 py-2 lg:hidden bg-primary-light/30 backdrop-blur-lg" style={{
            }}>
              <button
                onClick={() => setMenuOpen(true)}
                className="p-2 rounded-lg transition-all active:bg-primary-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 touch-manipulation"
                aria-label="Open history"
                style={{ color: THEME.text[800] }}
              >
                <History className="h-6 w-6" />
              </button>

              <button
                onClick={() => router.push('/dashboard')}
                className="cursor-pointer p-2 rounded-lg transition-all active:bg-primary-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 touch-manipulation"
                aria-label="Close chat"
                style={{ color: THEME.text[800] }}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Top bar (desktop) - Close button */}
            <div className="hidden lg:flex fixed top-0 right-0 z-50 items-center justify-end p-6">
              <button
                onClick={() => router.push('/dashboard')}
                className="cursor-pointer p-2 rounded-lg transition-all hover:bg-primary-light/50 active:bg-primary-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Close chat"
                style={{ color: THEME.text[800] }}
              >
                <X className="h-6 w-6" />
              </button>
            </div>


            {/* Chat */}
            <section
              ref={listRef}
              className="flex-1 pt-12 overflow-y-auto relative"
              style={{
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: '200px',
              }}
            >
              {/* Fixed background video positioned at center */}
              <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0">
                <div className="relative w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] md:w-[600px] md:h-[600px]">
                  <video
                    src="/test2.webm"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload={videoPreload}
                    poster={CHAT_VIDEO_POSTER}
                    className="w-full h-full object-contain opacity-60"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 py-3 sm:py-4 space-y-3">
                {(active?.messages ?? []).filter(m => {
                  // Always show user messages
                  if (m.role === "user") return true;
                  // Show assistant messages if they have content OR if we're streaming and this is the streaming message
                  if (m.role === "assistant") {
                    if (m.content) return true;
                    // Show empty assistant message if we're streaming to this session
                    if (isStreaming && streamingMessageId === activeId) {
                      const isLast = (active?.messages ?? []).indexOf(m) === (active?.messages ?? []).length - 1;
                      return isLast;
                    }
                  }
                  return false;
                }).map((m, i) => {
                  const isUser = m.role === "user";
                  // Check if this is the streaming message: it's the last assistant message and we're currently streaming
                  const isLastMessage = i === (active?.messages ?? []).length - 1;
                  const isStreamingMsg = isStreaming && !isUser && streamingMessageId === activeId && isLastMessage;
                  return (
                    <div
                      key={`${m.ts ?? i}-${i}`}
                      className={`flex items-start gap-2 sm:gap-3 ${isUser ? "justify-end" : ""
                        }`}
                    >
                      <motion.div
                        className={`rounded-2xl px-4 py-3 text-base leading-relaxed sm:px-5 sm:py-4 sm:text-lg transition-all ${isUser
                            ? "ml-auto max-w-full sm:max-w-[80%] shadow-lg"
                            : "max-w-full sm:max-w-[80%] shadow-lg"
                          }`}
                        style={{
                          lineHeight: '1.4',
                          ...(isUser
                            ? {
                              color: THEME.text[900],
                              backgroundColor: '#ff9cad',
                              boxShadow: "0 4px 16px rgba(251, 113, 133, 0.4)",
                            }
                            : {
                              color: THEME.text[800],
                              backgroundColor: THEME.background.white,
                              boxShadow: "0 2px 12px rgba(31, 41, 55, 0.08), 0 0 0 1px rgba(236, 72, 153, 0.12)",
                            })
                        }}
                      >
                        {isStreamingMsg ? (
                          <div className="relative w-full streaming-content">
                            {streamingContent && streamingContent.trim().length > 0 ? (
                              <div className="streaming-text wrap-break-words" style={{
                                fontSize: '1rem',
                                lineHeight: '1.4',
                                color: THEME.text[800],
                                fontWeight: 500,
                                letterSpacing: '0.01em',
                                textShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                                WebkitFontSmoothing: 'antialiased',
                                MozOsxFontSmoothing: 'grayscale',
                              }}>
                                {renderMarkdownText(streamingContent)}
                                <span
                                  className="inline-block w-0.5 h-5 ml-1 mb-0.5 align-middle rounded-sm streaming-cursor"
                                  style={{
                                    backgroundColor: THEME.pink[500],
                                    transition: 'opacity 0.2s ease-in-out',
                                  }}
                                />
                              </div>
                            ) : (
                              <CoffeeLoading />
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="wrap-break-words" style={{
                              fontSize: '1rem',
                              lineHeight: '1.4',
                              color: THEME.text[800],
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                              textShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale',
                            }}>
                              {renderMarkdownText(m.content)}
                            </div>
                            {/* Follow-up links */}
                            {!isUser && m.follow_up_links && m.follow_up_links.length > 0 && (
                              <div className="mt-4 pt-4 border-t" style={{ borderColor: THEME.pink[200] }}>
                                <div className="text-sm font-medium mb-2" style={{ color: THEME.text[700] }}>
                                  Related topics:
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {m.follow_up_links.map((link, linkIdx) => (
                                    <button
                                      key={linkIdx}
                                      onClick={async () => {
                                        if (loading) return;
                                        const id = activeId ?? await newChat();
                                        // Use subtopic for matching (stable identifier), label is only for display
                                        void sendToAPI(link.subtopic, id);
                                      }}
                                      className="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer hover:scale-105 active:scale-95"
                                      style={{
                                        backgroundColor: THEME.pink[100],
                                        color: THEME.pink[700],
                                        border: `1px solid ${THEME.pink[300]}`,
                                      }}
                                    >
                                      <LinkIcon className="inline h-3 w-3 mr-1.5" />
                                      {link.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
                {/* Show loading component when loading but not yet streaming (fallback for edge cases) */}
                {loading && !isStreaming && (
                  <div className="flex items-start gap-2 sm:gap-3">
                    <motion.div
                      className="rounded-2xl px-4 py-3 text-base leading-relaxed sm:px-5 sm:py-4 sm:text-lg shadow-lg max-w-full sm:max-w-[80%]"
                      style={{
                        backgroundColor: THEME.background.white,
                        boxShadow: "0 2px 12px rgba(31, 41, 55, 0.08), 0 0 0 1px rgba(236, 72, 153, 0.12)",
                      }}
                    >
                      <CoffeeLoading />
                    </motion.div>
                  </div>
                )}
                <div ref={bottomRef} style={{ height: '1px', marginTop: '1rem' }} />
              </div>
            </section>

            {/* Composer — cloud-top surface: irregular wavy top, straight sides & bottom */}
            <footer className="fixed bottom-0 left-0 right-0 z-20 safe-area-inset-bottom lg:left-72" style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0)',
            }}>
              {/* Cloud top bumps — SVG wave that sits above the main panel */}
              <div className="relative">
                <svg
                  viewBox="0 0 400 32"
                  preserveAspectRatio="none"
                  className="absolute bottom-full left-0 right-0 w-full h-6 sm:h-8"
                  style={{ filter: 'drop-shadow(0 -4px 8px rgba(236, 72, 153, 0.12))' }}
                >
                  <defs>
                    <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(253, 242, 248, 0.98)" />
                      <stop offset="35%" stopColor="rgba(252, 231, 243, 0.98)" />
                      <stop offset="65%" stopColor="rgba(243, 232, 255, 0.98)" />
                      <stop offset="100%" stopColor="rgba(237, 233, 254, 0.98)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 32 
                       C20 32, 25 18, 50 18 
                       C75 18, 80 28, 100 28 
                       C120 28, 130 12, 160 12 
                       C190 12, 195 26, 220 26 
                       C245 26, 255 8, 290 8 
                       C325 8, 330 22, 355 22 
                       C380 22, 390 32, 400 32 
                       L400 32 L0 32 Z"
                    fill="url(#cloudGradient)"
                  />
                </svg>

                {/* Main panel — straight sides and bottom */}
                <div
                  className="pt-4 pb-5 px-4 sm:px-5 sm:pt-5 sm:pb-6"
                  style={{
                    background: `linear-gradient(135deg, 
                      rgba(253, 242, 248, 0.98) 0%, 
                      rgba(252, 231, 243, 0.98) 25%,
                      rgba(250, 232, 255, 0.98) 50%,
                      rgba(243, 232, 255, 0.98) 75%,
                      rgba(237, 233, 254, 0.98) 100%
                    )`,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: `
                      inset 0 1px 0 rgba(255, 255, 255, 0.8),
                      0 -2px 20px rgba(168, 85, 247, 0.08),
                      0 4px 24px rgba(236, 72, 153, 0.1)
                    `,
                  }}
                >
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const text = input.trim();
                      if (!text || loading) return;
                      const id = activeId ?? await newChat();
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "64px";
                      }
                      void sendToAPI(text, id);
                    }}
                    className="mx-auto flex w-full max-w-4xl flex-col items-stretch gap-0"
                  >
                    <div className="relative flex w-full items-center">
                      <label htmlFor="composer" className="sr-only">
                        Message Lisa
                      </label>
                      <div className="relative w-full">
                        <textarea
                          id="composer"
                          ref={textareaRef}
                          rows={1}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              const text = input.trim();
                              if (!text || loading) return;
                              const id = activeId ?? await newChat();
                              void sendToAPI(text, id);
                            }
                          }}
                          aria-label="Type your message"
                          placeholder="Ask anything..."
                          className={`w-full resize-none overflow-hidden text-lg sm:text-xl font-bold px-5 py-4 sm:px-6 sm:py-5 outline-none touch-manipulation transition-all duration-200 ease-out ${input.trim() ? 'pr-14 sm:pr-16' : 'pr-5'}`}
                          style={{
                            minHeight: '64px',
                            color: THEME.text[900],
                            background: 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.88) 100%)',
                            borderRadius: '20px',
                            border: '1.5px solid rgba(216, 180, 254, 0.5)',
                            boxShadow: 'inset 0 2px 4px rgba(168, 85, 247, 0.06), 0 2px 8px rgba(236, 72, 153, 0.08)',
                          }}
                        />

                        <AnimatePresence mode="wait">
                          {input.trim() && (
                            <motion.button
                              type="submit"
                              disabled={loading}
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 25,
                                mass: 0.8,
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 focus:outline-none touch-manipulation z-10"
                              style={{
                                background: `linear-gradient(135deg, ${THEME.pink[500]} 0%, ${THEME.purple[500]} 100%)`,
                                boxShadow: '0 4px 14px rgba(168, 85, 247, 0.4), 0 2px 6px rgba(236, 72, 153, 0.3)',
                              }}
                              aria-label="Send message"
                            >
                              {loading ? (
                                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                              )}
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <p
                      className="mt-3 w-full text-center text-xs leading-relaxed"
                      style={{ color: THEME.text[600] }}
                    >
                      Lisa is here to support you with menopause info, but she isn&apos;t a doctor and her guidance should never replace professional medical advice.
                    </p>
                  </form>
                </div>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}

export default dynamic(() => Promise.resolve(ChatPageInner), { ssr: false });
