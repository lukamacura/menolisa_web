/**
 * Convert Markdown format knowledge base files to YAML format
 * Reuses parsing logic from ingest-documents.ts for accuracy
 */

import fs from 'fs';
import path from 'path';

// Copy the parsing functions from ingest-documents.ts
function parseMarkdownSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection: string[] = [];
  let lastTopicHeading: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (line.match(/^\s*##\s+/)) {
      lastTopicHeading = line;
      continue;
    }
    
    const isSubtopicHeading = trimmed.match(/^###\s+/);
    
    if (isSubtopicHeading) {
      let isFollowedByMetadata = false;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.includes('**Persona:**') || 
            nextLine.includes('**Topic:**') || 
            nextLine.includes('**Subtopic:**')) {
          isFollowedByMetadata = true;
          break;
        }
        if (nextLine.match(/^#{1,3}\s+/)) {
          break;
        }
      }
      
      if (isFollowedByMetadata && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
        if (lastTopicHeading) {
          currentSection.push(lastTopicHeading);
        }
      }
    }
    
    currentSection.push(line);
  }
  
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }
  
  return sections;
}

function extractMarkdownMetadata(section: string): { persona: string; topic: string; subtopic: string } | null {
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

function extractContentText(section: string): string {
  const contentMatch = section.match(/###\s*\*\*Content\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Action|Motivation|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  let content = contentMatch ? contentMatch[1].trim() : '';
  // Remove stray separators from content
  content = content.replace(/^---\s*$/gm, '').trim();
  return content;
}

function extractActionTips(section: string): string[] {
  const tips: string[] = [];
  const actionTipsMatch = section.match(/###\s*\*\*Action Tips?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Motivation|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  
  if (actionTipsMatch) {
    const tipsText = actionTipsMatch[1];
    const tipLines = tipsText.split('\n');
    for (const line of tipLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        let tip = trimmed.replace(/^[-•]\s*/, '').trim();
        tip = tip.replace(/\*\*([^*]+):\*\*\s*/g, '$1: ');
        // Skip empty tips or separators
        if (tip && tip !== '--' && tip !== '---') {
          tips.push(tip);
        }
      }
    }
  }
  
  return tips;
}

function extractMotivationNudge(section: string): string {
  const motivationMatch = section.match(/###\s*\*\*Motivation Nudge\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  let motivation = motivationMatch ? motivationMatch[1].trim() : '';
  // Remove trailing separators
  motivation = motivation.replace(/\n*---\s*$/g, '').trim();
  return motivation;
}

function extractHabitStrategy(section: string): { principle?: string; explanation?: string; example?: string; habitTip?: string } | undefined {
  const habitStrategyMatch = section.match(/###\s*\*\*Habit Strategy[\s\S]*?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  
  if (!habitStrategyMatch) return undefined;
  
  const strategyText = habitStrategyMatch[1];
  const principleMatch = strategyText.match(/\*\*Strategy:\*\*|\*\*Principle:\*\*\s*([^\r\n]+)/);
  const explanationMatch = strategyText.match(/\*\*Explanation:\*\*\s*([^\r\n]+)/);
  const exampleMatch = strategyText.match(/\*\*Example:\*\*\s*([^\r\n]+)/);
  const tipMatch = strategyText.match(/\*\*Habit Tip:\*\*|\*\*Tip:\*\*\s*([^\r\n]+)/);
  
  return {
    principle: principleMatch?.[1]?.trim(),
    explanation: explanationMatch?.[1]?.trim(),
    example: exampleMatch?.[1]?.trim(),
    habitTip: tipMatch?.[1]?.trim(),
  };
}

function extractFollowUpQuestion(section: string): string {
  const followUpMatch = section.match(/###\s*\*\*Follow-Up (?:Question|Questions)\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Habit|Intent|Keywords)|---\s*$|$)/i);
  if (!followUpMatch) return '';
  
  let followUp = followUpMatch[1].trim();
  if (followUp.includes('-')) {
    const firstLine = followUp.split('\n')[0].trim();
    followUp = firstLine.replace(/^-\s*/, '');
  }
  return followUp;
}

function parseMarkdownIntentPatterns(section: string): string[] {
  const patterns: string[] = [];
  const intentPatternsMatch = section.match(/###\s*\*\*Intent Patterns?\*\*\s*\n([\s\S]*?)(?=###|---\s*$|$)/i);
  
  if (!intentPatternsMatch) return patterns;
  
  const patternsText = intentPatternsMatch[1];
  const lines = patternsText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.match(/^(PRIMARY|SECONDARY|TIER\s+\d+|🎯)/i)) continue;
    if (trimmed.match(/^The\s+["'].*?["']\s+cluster:/i)) continue;
    if (trimmed.match(/^(QUESTIONS|CLUSTER|INTENTS?):/i) && !trimmed.match(/^[-•]/)) continue;
    
    if (trimmed.match(/^[-•]\s+/)) {
      let pattern = trimmed.replace(/^[-•]\s+/, '').trim();
      pattern = pattern.replace(/^["']|["']$/g, '').trim();
      pattern = pattern.replace(/\s*\[\+.*?\]\s*$/, '').trim();
      pattern = pattern.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (pattern && pattern.length >= 3) {
        patterns.push(pattern);
      }
    }
  }
  
  return patterns;
}

function parseMarkdownKeywords(section: string): { [category: string]: string[] } {
  const keywords: { [category: string]: string[] } = {};
  const keywordsMatch = section.match(/###\s*\*\*Keywords?\*\*\s*\n([\s\S]*?)(?=###|---\s*$|$)/);
  
  if (!keywordsMatch) return keywords;
  
  const keywordsText = keywordsMatch[1];
  const lines = keywordsText.split('\n');
  let currentCategory = 'Everyday Language';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if it's a category header
    if (trimmed.match(/^(⚡|💪|🔬|🌡️|🎭|❓|CRITICAL|PRIMARY|SECONDARY|SCIENTIFIC|SYMPTOM|EMOTIONAL|QUESTION)/) ||
        trimmed.match(/^[A-Z][A-Z\s&/]+KEYWORDS?/)) {
      currentCategory = trimmed
        .replace(/^(⚡|💪|🔬|🌡️|🎭|❓)\s*/, '')
        .replace(/\s*KEYWORDS?.*$/i, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
      if (!currentCategory || currentCategory.length < 3) currentCategory = 'Everyday Language';
      keywords[currentCategory] = [];
      continue;
    }
    
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      let keyword = trimmed.replace(/^[-•]\s+/, '').trim();
      keyword = keyword.replace(/^["']|["']$/g, '').trim();
      if (keyword && keyword.length >= 2) {
        if (!keywords[currentCategory]) {
          keywords[currentCategory] = [];
        }
        keywords[currentCategory].push(keyword);
      }
    }
  }
  
  return keywords;
}

function escapeYAMLString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function convertToYAML(metadata: { persona: string; topic: string; subtopic: string }, content: string, actionTips: string[], motivationNudge: string, habitStrategy: any, followUpQuestion: string, intentPatterns: string[], keywords: { [category: string]: string[] }): string {
  let yaml = '---\n';
  yaml += `persona: "${metadata.persona}"\n`;
  yaml += `topic: "${metadata.topic}"\n`;
  yaml += `subtopic: "${metadata.subtopic}"\n`;
  yaml += '\n';
  
  // Content
  yaml += 'content_text: |\n';
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    yaml += `  ${line}\n`;
  }
  yaml += '\n';
  
  // Action tips
  if (actionTips.length > 0) {
    yaml += 'action_tips:\n';
    for (const tip of actionTips) {
      yaml += `  - "${escapeYAMLString(tip)}"\n`;
    }
    yaml += '\n';
  }
  
  // Motivation nudge
  if (motivationNudge) {
    yaml += `motivation_nudge: "${escapeYAMLString(motivationNudge)}"\n`;
    yaml += '\n';
  }
  
  // Habit strategy
  if (habitStrategy && (habitStrategy.principle || habitStrategy.explanation || habitStrategy.example || habitStrategy.habitTip)) {
    yaml += 'habit_strategy:\n';
    if (habitStrategy.principle) {
      yaml += `  principle: "${escapeYAMLString(habitStrategy.principle)}"\n`;
    }
    if (habitStrategy.explanation) {
      yaml += `  explanation: "${escapeYAMLString(habitStrategy.explanation)}"\n`;
    }
    if (habitStrategy.example) {
      yaml += `  example: "${escapeYAMLString(habitStrategy.example)}"\n`;
    }
    if (habitStrategy.habitTip) {
      yaml += `  habit_tip: "${escapeYAMLString(habitStrategy.habitTip)}"\n`;
    }
    yaml += '\n';
  }
  
  // Follow-up question
  if (followUpQuestion) {
    yaml += `follow_up_question: "${escapeYAMLString(followUpQuestion)}"\n`;
    yaml += '\n';
  }
  
  // Intent patterns
  if (intentPatterns.length > 0) {
    yaml += 'intent_patterns:\n';
    for (const pattern of intentPatterns) {
      yaml += `  - "${escapeYAMLString(pattern)}"\n`;
    }
    yaml += '\n';
  }
  
  // Keywords
  if (Object.keys(keywords).length > 0) {
    yaml += 'keywords:\n';
    for (const [category, keywordList] of Object.entries(keywords)) {
      if (keywordList.length > 0) {
        yaml += `  ${category}:\n`;
        for (const keyword of keywordList) {
          yaml += `    - "${escapeYAMLString(keyword)}"\n`;
        }
      }
    }
  }
  
  yaml += '---\n';
  
  return yaml;
}

function convertFile(inputPath: string, outputPath: string) {
  console.log(`Converting ${path.basename(inputPath)}...`);
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const sections = parseMarkdownSections(content);
  
  let yamlOutput = '';
  let convertedCount = 0;
  
  for (const sectionText of sections) {
    const metadata = extractMarkdownMetadata(sectionText);
    if (!metadata) continue;
    
    const contentText = extractContentText(sectionText);
    const actionTips = extractActionTips(sectionText);
    const motivationNudge = extractMotivationNudge(sectionText);
    const habitStrategy = extractHabitStrategy(sectionText);
    const followUpQuestion = extractFollowUpQuestion(sectionText);
    const intentPatterns = parseMarkdownIntentPatterns(sectionText);
    const keywords = parseMarkdownKeywords(sectionText);
    
    yamlOutput += convertToYAML(metadata, contentText, actionTips, motivationNudge, habitStrategy, followUpQuestion, intentPatterns, keywords);
    yamlOutput += '\n';
    convertedCount++;
  }
  
  fs.writeFileSync(outputPath, yamlOutput, 'utf-8');
  console.log(`✓ Converted ${convertedCount} sections`);
}

// Main execution
const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');

// Convert files
const filesToConvert = [
  'Sleep Disturbances.md',
  'Metabolic Changes & Weight Gain.md',
];

for (const filename of filesToConvert) {
  const inputPath = path.join(knowledgeBaseDir, filename);
  const outputPath = path.join(knowledgeBaseDir, filename.replace('.md', '_converted.md'));
  
  if (fs.existsSync(inputPath)) {
    convertFile(inputPath, outputPath);
  } else {
    console.log(`⚠️  File not found: ${filename}`);
  }
}

console.log('\n✓ Conversion complete! Review the _converted.md files and replace originals if satisfied.');

