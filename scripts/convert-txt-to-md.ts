/**
 * Convert JSON .txt files to Markdown .md files for RAG
 * 
 * This script converts knowledge base .txt files (with JSON structure) to .md files
 * keeping only content useful for RAG (removes keywords, intent, metadata)
 * 
 * Usage:
 *   npx tsx scripts/convert-txt-to-md.ts
 */

import fs from 'fs';
import path from 'path';

interface KnowledgeBaseDoc {
  topic?: string;
  subtopic?: string;
  answer?: string;
  mechanism_summary?: string;
  action_tips?: string[];
  motivation_nudge?: string;
  habit_strategy?: {
    strategy?: string;
    explanation?: string;
    example?: string;
    habit_tip?: string;
  };
  follow_up?: string | string[];
  fallback?: string;
  disclaimer?: string;
  empathy_fallback?: string;
}

/**
 * Fix common JSON syntax errors
 */
function fixJsonSyntax(content: string): string {
  // Remove leading/trailing whitespace
  content = content.trim();
  
  // Fix missing quotes around persona value (various patterns)
  content = content.replace(/"persona":\s*menopause"/g, '"persona": "menopause"');
  content = content.replace(/"persona":\s*menopause\s*"/g, '"persona": "menopause"');
  content = content.replace(/"persona":\s*menopause([,\n}])/g, '"persona": "menopause"$1');
  content = content.replace(/"persona":\s*menopause\s*$/gm, '"persona": "menopause"');
  
  // Fix missing commas between properties - use a more robust approach
  // Pattern: property ending with quote or bracket/brace, followed by new property without comma
  content = content.replace(/(["\]])\s*\n\s*("(?:topic|subtopic|intent|keywords|answer|mechanism_summary|action_tips|motivation_nudge|habit_strategy|follow_up_type|follow_up|fallback|disclaimer|empathy_fallback|branches|set_memory)":)/g, '$1,\n$2');
  
  // Fix missing commas after string values before next property (same line)
  content = content.replace(/([^,\n}])\s*\n\s*("(?:topic|subtopic|intent|keywords|answer|mechanism_summary|action_tips|motivation_nudge|habit_strategy|follow_up_type|follow_up|fallback|disclaimer|empathy_fallback|branches|set_memory)":)/g, (match, p1, p2) => {
    // Don't add comma if p1 already ends with comma, quote, or bracket
    if (!/[,\]"}]/.test(p1.slice(-1))) {
      return `${p1},\n${p2}`;
    }
    return match;
  });
  
  // Fix missing commas after closing brackets/braces before string properties
  content = content.replace(/([\]}])\s*\n\s*("(?:answer|fallback|disclaimer|follow_up|motivation_nudge|mechanism_summary|empathy_fallback|set_memory|branches)":)/g, '$1,\n$2');
  content = content.replace(/([\]}])\s*("(?:answer|fallback|disclaimer|follow_up|motivation_nudge|mechanism_summary|empathy_fallback|set_memory|branches)":)/g, '$1,\n$2');
  
  // Fix trailing commas in arrays/objects before closing (but keep them if followed by content)
  content = content.replace(/,(\s*\n\s*[}\]])/g, '$1');
  
  // Fix duplicate follow_up_type
  content = content.replace(/"follow_up_type":\s*"[^"]+",\s*"follow_up_type":\s*"[^"]+",/g, (match) => {
    const first = match.match(/"follow_up_type":\s*"([^"]+)"/);
    return first ? `"follow_up_type": "${first[1]}",` : match;
  });
  
  // Fix extra closing brackets before properties (like ] before answer)
  content = content.replace(/\]\s*\n\s*\]\s*\n\s*("(?:answer|fallback|disclaimer|follow_up|motivation_nudge|mechanism_summary)":)/g, '],\n$1');
  
  // Fix empty array items (trailing commas in arrays)
  content = content.replace(/,\s*\n\s*\]/g, '\n]');
  
  return content;
}

/**
 * Parse JSON content, handling syntax errors and arrays
 */
function parseJson(content: string, filename?: string): KnowledgeBaseDoc[] {
  const results: KnowledgeBaseDoc[] = [];
  
  // Remove leading/trailing whitespace
  content = content.trim();
  
  // Check if it's an array of objects
  if (content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is KnowledgeBaseDoc => item !== null && typeof item === 'object');
      }
    } catch (error) {
      // Try fixing and parsing again
      try {
        const fixed = fixJsonSyntax(content);
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is KnowledgeBaseDoc => item !== null && typeof item === 'object');
        }
      } catch (secondError) {
        // Try to extract individual objects from array
        const objects = extractObjectsFromArray(content);
        if (objects.length > 0) {
          return objects;
        }
        // If extraction failed, log the error for debugging
        if (filename) {
          console.error(`   ⚠ Parse error in ${filename}: ${(secondError as Error).message.substring(0, 100)}`);
        }
      }
    }
  }
  
  // Single object
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      results.push(parsed);
      return results;
    }
  } catch (error) {
    try {
      const fixed = fixJsonSyntax(content);
      const parsed = JSON.parse(fixed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        results.push(parsed);
        return results;
      }
    } catch (secondError) {
      // Last resort: try to extract object manually
      const obj = extractObject(content);
      if (obj) {
        results.push(obj);
        return results;
      }
      // Log error for debugging
      if (filename) {
        const errorMsg = (secondError as Error).message;
        const position = errorMsg.match(/position (\d+)/);
        if (position) {
          const pos = parseInt(position[1]);
          const start = Math.max(0, pos - 50);
          const end = Math.min(content.length, pos + 50);
          console.error(`   ⚠ Parse error in ${filename} at position ${pos}:`);
          console.error(`      ...${content.substring(start, end)}...`);
        } else {
          console.error(`   ⚠ Parse error in ${filename}: ${errorMsg.substring(0, 100)}`);
        }
      }
    }
  }
  
  return results;
}

/**
 * Extract multiple JSON objects from malformed array
 */
function extractObjectsFromArray(content: string): KnowledgeBaseDoc[] {
  const objects: KnowledgeBaseDoc[] = [];
  let depth = 0;
  let start = -1;
  let braceCount = 0;
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (braceCount === 0) start = i;
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && start !== -1) {
        const objStr = content.substring(start, i + 1);
        try {
          const fixed = fixJsonSyntax(objStr);
          const parsed = JSON.parse(fixed);
          if (parsed && typeof parsed === 'object') {
            objects.push(parsed);
          }
        } catch (e) {
          // Skip this object
        }
        start = -1;
      }
    }
  }
  
  return objects;
}

/**
 * Extract single JSON object from malformed content using regex
 */
function extractObject(content: string): KnowledgeBaseDoc | null {
  const doc: Partial<KnowledgeBaseDoc> = {};
  
  // Extract topic
  const topicMatch = content.match(/"topic":\s*"([^"]+)"/);
  if (topicMatch) doc.topic = topicMatch[1];
  
  // Extract subtopic
  const subtopicMatch = content.match(/"subtopic":\s*"([^"]+)"/);
  if (subtopicMatch) doc.subtopic = subtopicMatch[1];
  
  // Extract answer (handle multiline strings)
  // Removed 's' flag for ES2017 compatibility - pattern already handles newlines via \\n
  const answerMatch = content.match(/"answer":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (answerMatch) {
    doc.answer = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Extract mechanism_summary
  const mechanismMatch = content.match(/"mechanism_summary":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (mechanismMatch) {
    doc.mechanism_summary = mechanismMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Extract action_tips array
  const actionTipsMatch = content.match(/"action_tips":\s*\[([^\]]+)\]/);
  if (actionTipsMatch) {
    const tipsContent = actionTipsMatch[1];
    const tips = tipsContent.match(/"((?:[^"\\]|\\.|\\n)*)"/g);
    if (tips) {
      doc.action_tips = tips.map(tip => 
        tip.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
      );
    }
  }
  
  // Extract motivation_nudge
  const motivationMatch = content.match(/"motivation_nudge":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (motivationMatch) {
    doc.motivation_nudge = motivationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Extract habit_strategy
  const habitStrategyMatch = content.match(/"habit_strategy":\s*\{([^}]+)\}/);
  if (habitStrategyMatch) {
    const strategyContent = habitStrategyMatch[1];
    doc.habit_strategy = {};
    
    const strategyMatch = strategyContent.match(/"strategy":\s*"([^"]+)"/);
    if (strategyMatch) doc.habit_strategy.strategy = strategyMatch[1];
    
    const explanationMatch = strategyContent.match(/"explanation":\s*"((?:[^"\\]|\\.|\\n)*)"/);
    if (explanationMatch) {
      doc.habit_strategy.explanation = explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    
    const exampleMatch = strategyContent.match(/"example":\s*"((?:[^"\\]|\\.|\\n)*)"/);
    if (exampleMatch) {
      doc.habit_strategy.example = exampleMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    
    const habitTipMatch = strategyContent.match(/"habit_tip":\s*"((?:[^"\\]|\\.|\\n)*)"/);
    if (habitTipMatch) {
      doc.habit_strategy.habit_tip = habitTipMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }
  
  // Extract follow_up (can be string or array)
  const followUpArrayMatch = content.match(/"follow_up":\s*\[([^\]]+)\]/);
  if (followUpArrayMatch) {
    const followUpContent = followUpArrayMatch[1];
    const followUps = followUpContent.match(/"((?:[^"\\]|\\.|\\n)*)"/g);
    if (followUps) {
      doc.follow_up = followUps.map(fu => 
        fu.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
      );
    }
  } else {
    const followUpStringMatch = content.match(/"follow_up":\s*"((?:[^"\\]|\\.|\\n)*)"/);
    if (followUpStringMatch) {
      doc.follow_up = followUpStringMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }
  
  // Extract fallback
  const fallbackMatch = content.match(/"fallback":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (fallbackMatch) {
    doc.fallback = fallbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Extract empathy_fallback
  const empathyFallbackMatch = content.match(/"empathy_fallback":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (empathyFallbackMatch) {
    doc.empathy_fallback = empathyFallbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Extract disclaimer
  const disclaimerMatch = content.match(/"disclaimer":\s*"((?:[^"\\]|\\.|\\n)*)"/);
  if (disclaimerMatch) {
    doc.disclaimer = disclaimerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  // Only return if we have at least an answer or topic
  if (doc.answer || doc.topic) {
    return doc as KnowledgeBaseDoc;
  }
  
  return null;
}

/**
 * Convert JSON document to Markdown format
 */
function convertToMarkdown(doc: KnowledgeBaseDoc, filename: string): string {
  const lines: string[] = [];
  
  // Title (use topic and subtopic, or filename as fallback)
  if (doc.topic) {
    let title = doc.topic;
    if (doc.subtopic) {
      title += ` - ${doc.subtopic}`;
    }
    lines.push(`# ${title}\n`);
  } else {
    // Fallback to filename
    const title = filename.replace('.txt', '').replace(/_/g, ' ').replace(/-/g, ' ');
    lines.push(`# ${title}\n`);
  }
  
  // Main answer content
  if (doc.answer) {
    lines.push(doc.answer);
    lines.push('');
  }
  
  // Mechanism summary
  if (doc.mechanism_summary) {
    lines.push('---');
    lines.push('');
    lines.push('## What\'s really happening? (Mechanism Summary)');
    lines.push('');
    lines.push(doc.mechanism_summary);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // Action tips
  if (doc.action_tips && doc.action_tips.length > 0) {
    lines.push('## Action Tips');
    lines.push('');
    doc.action_tips.forEach(tip => {
      lines.push(`- ${tip}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // Motivation nudge (if present, include it)
  if (doc.motivation_nudge) {
    lines.push(doc.motivation_nudge);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // Habit strategy
  if (doc.habit_strategy) {
    lines.push('## Habit Strategy');
    lines.push('');
    if (doc.habit_strategy.strategy) {
      lines.push(`**Strategy:** ${doc.habit_strategy.strategy}`);
      lines.push('');
    }
    if (doc.habit_strategy.explanation) {
      lines.push(`**How it works (explanation):**`);
      lines.push('');
      lines.push(doc.habit_strategy.explanation);
      lines.push('');
    }
    if (doc.habit_strategy.example) {
      lines.push(`**Example:**`);
      lines.push('');
      lines.push(doc.habit_strategy.example);
      lines.push('');
    }
    if (doc.habit_strategy.habit_tip) {
      lines.push(`**Habit tip:**`);
      lines.push('');
      lines.push(doc.habit_strategy.habit_tip);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  
  // Follow-up paths
  if (doc.follow_up) {
    lines.push('## Gentle Follow-Up Paths');
    lines.push('');
    if (Array.isArray(doc.follow_up)) {
      doc.follow_up.forEach(follow => {
        lines.push(`- ${follow}`);
      });
    } else {
      lines.push(`- ${doc.follow_up}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // Fallback message
  if (doc.fallback) {
    lines.push('## Fallback Message');
    lines.push('');
    lines.push(doc.fallback);
    lines.push('');
    lines.push('---');
    lines.push('');
  } else if (doc.empathy_fallback) {
    lines.push('## Fallback Message');
    lines.push('');
    lines.push(doc.empathy_fallback);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // Disclaimer
  if (doc.disclaimer) {
    lines.push('## Disclaimer');
    lines.push('');
    lines.push(doc.disclaimer);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Convert all .txt files to .md files
 */
async function convertAllFiles() {
  const kbDir = path.join(process.cwd(), 'knowledge-base');
  
  if (!fs.existsSync(kbDir)) {
    console.error(`❌ Knowledge base directory not found: ${kbDir}`);
    process.exit(1);
  }
  
  // Get all .txt files
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.txt'));
  
  if (files.length === 0) {
    console.warn(`⚠️  No .txt files found in ${kbDir}`);
    return;
  }
  
  console.log(`📄 Found ${files.length} .txt file(s) to convert\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(kbDir, file);
      // Try UTF-8 first, then UTF-16 LE if that fails
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
        // Check if it looks like UTF-16 (has null bytes)
        if (content.includes('\u0000')) {
          content = fs.readFileSync(filePath, 'utf-16le');
        }
      } catch (encodingError) {
        // Try UTF-16 LE
        try {
          content = fs.readFileSync(filePath, 'utf-16le');
        } catch {
          // Fallback to UTF-8 with error handling
          content = fs.readFileSync(filePath, 'utf-8');
        }
      }
      
      // Parse JSON (may return multiple documents)
      const docs = parseJson(content, file);
      
      if (!docs || docs.length === 0) {
        console.error(`   ✗ Failed to parse: ${file}`);
        errorCount++;
        continue;
      }
      
      // Handle multiple documents in one file
      if (docs.length === 1) {
        // Single document - use original filename
        const markdown = convertToMarkdown(docs[0], file);
        const mdFilename = file.replace('.txt', '.md');
        const mdFilePath = path.join(kbDir, mdFilename);
        fs.writeFileSync(mdFilePath, markdown, 'utf-8');
        console.log(`   ✓ Converted: ${file} → ${mdFilename}`);
        successCount++;
      } else {
        // Multiple documents - create separate files
        const baseName = file.replace('.txt', '');
        docs.forEach((doc, index) => {
          const subtopic = doc.subtopic || `Part ${index + 1}`;
          // Create safe filename from subtopic
          const safeSubtopic = subtopic
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 50);
          const mdFilename = `${baseName}_${safeSubtopic}.md`;
          const mdFilePath = path.join(kbDir, mdFilename);
          const markdown = convertToMarkdown(doc, file);
          fs.writeFileSync(mdFilePath, markdown, 'utf-8');
          console.log(`   ✓ Converted: ${file} → ${mdFilename} (part ${index + 1}/${docs.length})`);
        });
        successCount++;
      }
      
    } catch (error) {
      console.error(`   ✗ Error converting ${file}:`, error);
      errorCount++;
    }
  }
  
  console.log(`\n✨ Conversion complete!`);
  console.log(`   ✓ Success: ${successCount}`);
  if (errorCount > 0) {
    console.log(`   ✗ Errors: ${errorCount}`);
  }
}

// Run the conversion
if (require.main === module) {
  convertAllFiles()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { convertAllFiles, convertToMarkdown, parseJson };

