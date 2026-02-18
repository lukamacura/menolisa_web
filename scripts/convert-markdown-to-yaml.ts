/**
 * Convert Markdown format knowledge base files to YAML format
 * 
 * This script converts files from:
 * ## Topic
 * ### Subtopic
 * **Persona:** ...
 * **Topic:** ...
 * **Subtopic:** ...
 * 
 * To:
 * ---
 * persona: "..."
 * topic: "..."
 * subtopic: "..."
 * content_text: |
 *   ...
 */

import fs from 'fs';
import path from 'path';

interface Section {
  persona: string;
  topic: string;
  subtopic: string;
  content: string;
  actionTips: string[];
  motivationNudge: string;
  habitStrategy?: {
    principle?: string;
    explanation?: string;
    example?: string;
    habitTip?: string;
  };
  followUpQuestion: string;
  intentPatterns: string[];
  keywords: { [category: string]: string[] };
}

function parseMarkdownSection(sectionText: string): Section | null {
  // Extract metadata
  const personaMatch = sectionText.match(/\*\*Persona:\*\*\s*([^\r\n]+)/);
  const topicMatch = sectionText.match(/\*\*Topic:\*\*\s*([^\r\n]+)/);
  const subtopicMatch = sectionText.match(/\*\*Subtopic:\*\*\s*([^\r\n]+)/);
  
  if (!personaMatch || !topicMatch || !subtopicMatch) {
    return null;
  }
  
  const persona = personaMatch[1].trim();
  const topic = topicMatch[1].trim();
  const subtopic = subtopicMatch[1].trim();
  
  // Extract content
  const contentMatch = sectionText.match(/###\s*\*\*Content\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Action|Motivation|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  const content = contentMatch ? contentMatch[1].trim() : '';
  
  // Extract action tips
  const actionTipsMatch = sectionText.match(/###\s*\*\*Action Tips?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Motivation|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  const actionTips: string[] = [];
  if (actionTipsMatch) {
    const tipsText = actionTipsMatch[1];
    const tipLines = tipsText.split('\n');
    for (const line of tipLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        // Remove bullet and clean up
        let tip = trimmed.replace(/^[-•]\s*/, '').trim();
        // Remove bold markers from labels like "**Track patterns:**"
        tip = tip.replace(/\*\*([^*]+):\*\*\s*/g, '$1: ');
        actionTips.push(`"${tip}"`);
      }
    }
  }
  
  // Extract motivation nudge
  const motivationMatch = sectionText.match(/###\s*\*\*Motivation Nudge\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Habit|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  const motivationNudge = motivationMatch ? motivationMatch[1].trim() : '';
  
  // Extract habit strategy
  const habitStrategyMatch = sectionText.match(/###\s*\*\*Habit Strategy[\s\S]*?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Follow-Up|Intent|Keywords)|---\s*$|$)/i);
  let habitStrategy: Section['habitStrategy'] | undefined;
  if (habitStrategyMatch) {
    const strategyText = habitStrategyMatch[1];
    const principleMatch = strategyText.match(/\*\*Strategy:\*\*|\*\*Principle:\*\*\s*([^\r\n]+)/);
    const explanationMatch = strategyText.match(/\*\*Explanation:\*\*\s*([^\r\n]+)/);
    const exampleMatch = strategyText.match(/\*\*Example:\*\*\s*([^\r\n]+)/);
    const tipMatch = strategyText.match(/\*\*Habit Tip:\*\*|\*\*Tip:\*\*\s*([^\r\n]+)/);
    
    habitStrategy = {};
    if (principleMatch) habitStrategy.principle = principleMatch[1]?.trim() || '';
    if (explanationMatch) habitStrategy.explanation = explanationMatch[1]?.trim() || '';
    if (exampleMatch) habitStrategy.example = exampleMatch[1]?.trim() || '';
    if (tipMatch) habitStrategy.habitTip = tipMatch[1]?.trim() || '';
  }
  
  // Extract follow-up question
  const followUpMatch = sectionText.match(/###\s*\*\*Follow-Up (?:Question|Questions)\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Habit|Intent|Keywords)|---\s*$|$)/i);
  let followUpQuestion = '';
  if (followUpMatch) {
    followUpQuestion = followUpMatch[1].trim();
    // Handle multiple questions (bullet list)
    if (followUpQuestion.includes('-')) {
      const firstLine = followUpQuestion.split('\n')[0].trim();
      followUpQuestion = firstLine.replace(/^-\s*/, '');
    }
  }
  
  // Extract intent patterns
  const intentPatternsMatch = sectionText.match(/###\s*\*\*Intent Patterns?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Habit|Follow-Up|Keywords)|---\s*$|$)/i);
  const intentPatterns: string[] = [];
  if (intentPatternsMatch) {
    const patternsText = intentPatternsMatch[1];
    const lines = patternsText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, headers, and cluster labels
      if (!trimmed || 
          trimmed.match(/^(TIER|PRIMARY|SECONDARY|🎯)/i) ||
          trimmed.match(/^The\s+["'].*?["']\s+cluster:/i) ||
          trimmed.match(/^(QUESTIONS|CLUSTER|INTENTS?):/i)) {
        continue;
      }
      // Match bullet points
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        let pattern = trimmed.replace(/^[-•]\s+/, '').trim();
        pattern = pattern.replace(/^["']|["']$/g, '').trim();
        // Remove trailing notes
        pattern = pattern.replace(/\s*\[\+.*?\]\s*$/, '').trim();
        pattern = pattern.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (pattern && pattern.length >= 3) {
          intentPatterns.push(`"${pattern}"`);
        }
      }
    }
  }
  
  // Extract keywords
  const keywordsMatch = sectionText.match(/###\s*\*\*Keywords?\*\*\s*\n([\s\S]*?)(?=###\s*\*\*(?:Content|Action|Motivation|Habit|Follow-Up|Intent)|---\s*$|$)/i);
  const keywords: { [category: string]: string[] } = {};
  if (keywordsMatch) {
    const keywordsText = keywordsMatch[1];
    const lines = keywordsText.split('\n');
    let currentCategory = 'Everyday Language';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check if it's a category header
      if (trimmed.match(/^(⚡|💪|🔬|🌡️|🎭|❓|CRITICAL|PRIMARY|SECONDARY|SCIENTIFIC|SYMPTOM|EMOTIONAL|QUESTION)/) ||
          trimmed.match(/^[A-Z][A-Z\s&]+KEYWORDS?/)) {
        // Extract category name
        currentCategory = trimmed
          .replace(/^(⚡|💪|🔬|🌡️|🎭|❓)\s*/, '')
          .replace(/\s*KEYWORDS?.*$/i, '')
          .trim();
        if (!currentCategory) currentCategory = 'Everyday Language';
        keywords[currentCategory] = [];
        continue;
      }
      
      // Check if it's a bullet point
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        let keyword = trimmed.replace(/^[-•]\s+/, '').trim();
        keyword = keyword.replace(/^["']|["']$/g, '').trim();
        if (keyword && keyword.length >= 2) {
          if (!keywords[currentCategory]) {
            keywords[currentCategory] = [];
          }
          keywords[currentCategory].push(`"${keyword}"`);
        }
      }
    }
  }
  
  return {
    persona,
    topic,
    subtopic,
    content,
    actionTips,
    motivationNudge,
    habitStrategy,
    followUpQuestion,
    intentPatterns,
    keywords,
  };
}

function convertToYAML(section: Section): string {
  let yaml = '---\n';
  yaml += `persona: "${section.persona}"\n`;
  yaml += `topic: "${section.topic}"\n`;
  yaml += `subtopic: "${section.subtopic}"\n`;
  yaml += '\n';
  
  // Content
  yaml += 'content_text: |\n';
  const contentLines = section.content.split('\n');
  for (const line of contentLines) {
    yaml += `  ${line}\n`;
  }
  yaml += '\n';
  
  // Action tips
  if (section.actionTips.length > 0) {
    yaml += 'action_tips:\n';
    for (const tip of section.actionTips) {
      yaml += `  - ${tip}\n`;
    }
    yaml += '\n';
  }
  
  // Motivation nudge
  if (section.motivationNudge) {
    yaml += `motivation_nudge: "${section.motivationNudge.replace(/"/g, '\\"')}"\n`;
    yaml += '\n';
  }
  
  // Habit strategy
  if (section.habitStrategy) {
    yaml += 'habit_strategy:\n';
    if (section.habitStrategy.principle) {
      yaml += `  principle: "${section.habitStrategy.principle.replace(/"/g, '\\"')}"\n`;
    }
    if (section.habitStrategy.explanation) {
      yaml += `  explanation: "${section.habitStrategy.explanation.replace(/"/g, '\\"')}"\n`;
    }
    if (section.habitStrategy.example) {
      yaml += `  example: "${section.habitStrategy.example.replace(/"/g, '\\"')}"\n`;
    }
    if (section.habitStrategy.habitTip) {
      yaml += `  habit_tip: "${section.habitStrategy.habitTip.replace(/"/g, '\\"')}"\n`;
    }
    yaml += '\n';
  }
  
  // Follow-up question
  if (section.followUpQuestion) {
    yaml += `follow_up_question: "${section.followUpQuestion.replace(/"/g, '\\"')}"\n`;
    yaml += '\n';
  }
  
  // Intent patterns
  if (section.intentPatterns.length > 0) {
    yaml += 'intent_patterns:\n';
    for (const pattern of section.intentPatterns) {
      yaml += `  - ${pattern}\n`;
    }
    yaml += '\n';
  }
  
  // Keywords
  if (Object.keys(section.keywords).length > 0) {
    yaml += 'keywords:\n';
    for (const [category, keywordList] of Object.entries(section.keywords)) {
      if (keywordList.length > 0) {
        yaml += `  ${category}:\n`;
        for (const keyword of keywordList) {
          yaml += `    - ${keyword}\n`;
        }
      }
    }
  }
  
  yaml += '---\n';
  
  return yaml;
}

function parseMarkdownSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection: string[] = [];
  let lastTopicHeading: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track topic heading
    if (line.match(/^\s*##\s+/)) {
      lastTopicHeading = line;
      continue;
    }
    
    // Check if this is a subtopic heading
    const isSubtopicHeading = trimmed.match(/^###\s+/);
    
    if (isSubtopicHeading) {
      // Check if followed by metadata
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

function convertFile(inputPath: string, outputPath: string) {
  console.log(`Converting ${inputPath}...`);
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const sections = parseMarkdownSections(content);
  
  let yamlOutput = '';
  let convertedCount = 0;
  
  for (const sectionText of sections) {
    const section = parseMarkdownSection(sectionText);
    if (section) {
      yamlOutput += convertToYAML(section);
      yamlOutput += '\n';
      convertedCount++;
    }
  }
  
  fs.writeFileSync(outputPath, yamlOutput, 'utf-8');
  console.log(`✓ Converted ${convertedCount} sections to ${outputPath}`);
}

// Main execution
const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');

// Convert Sleep Disturbances.md
convertFile(
  path.join(knowledgeBaseDir, 'Sleep Disturbances.md'),
  path.join(knowledgeBaseDir, 'Sleep Disturbances.yaml')
);

// Convert Metabolic Changes & Weight Gain.md
convertFile(
  path.join(knowledgeBaseDir, 'Metabolic Changes & Weight Gain.md'),
  path.join(knowledgeBaseDir, 'Metabolic Changes & Weight Gain.yaml')
);

console.log('\nConversion complete! Review the .yaml files and rename them to .md if satisfied.');
