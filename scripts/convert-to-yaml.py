#!/usr/bin/env python3
"""
Convert Markdown format knowledge base files to YAML format
"""
import re
import os

def convert_markdown_to_yaml(content):
    """Convert Markdown format to YAML format"""
    # Split by sections (## headings)
    # Each section starts with ## Topic, then ### Subtopic, then metadata
    sections = re.split(r'^##\s+', content, flags=re.MULTILINE)
    # Filter out empty sections and keep only those with content
    sections = [s for s in sections if s.strip()]
    
    # Re-add the ## prefix for processing (skip first empty split if file starts with ##)
    if sections and not sections[0].strip().startswith('###'):
        sections = sections[1:]  # Remove first empty element if file starts with ##
    sections = [f'## {s}' for s in sections if s.strip()]
    
    yaml_sections = []
    
    for section in sections:
        # Extract metadata - try both formats
        persona_match = re.search(r'\*\*Persona:\*\*\s*([^\r\n]+)', section)
        topic_match = re.search(r'\*\*Topic:\*\*\s*([^\r\n]+)', section)
        subtopic_match = re.search(r'\*\*Subtopic:\*\*\s*([^\r\n]+)', section)
        
        # If metadata not found in ** format, try extracting from headings
        if not persona_match or not topic_match or not subtopic_match:
            topic_line = re.search(r'^##\s+(.+?)(?:\s*$|\n)', section, re.MULTILINE)
            subtopic_line = re.search(r'^###\s+(.+?)(?:\s*$|\n)', section, re.MULTILINE)
            if topic_line and subtopic_line:
                topic = topic_line.group(1).strip()
                subtopic = subtopic_line.group(1).strip()
                # Try to find persona
                persona_in_section = re.search(r'\*\*Persona:\*\*\s*([^\r\n]+)', section)
                if persona_in_section:
                    persona = persona_in_section.group(1).strip()
                else:
                    # Default persona if not found
                    persona = "menopause"
            else:
                print(f"Warning: Skipping section - cannot extract topic/subtopic")
                continue
        else:
            persona = persona_match.group(1).strip()
            topic = topic_match.group(1).strip()
            subtopic = subtopic_match.group(1).strip()
        
        # Extract content - stop at next ### or --- separator
        content_match = re.search(r'###\s+\*\*Content\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        content_text = content_match.group(1).strip() if content_match else ''
        # Clean up content - remove trailing separators
        content_text = re.sub(r'\n*---\s*\n*$', '', content_text, flags=re.MULTILINE).strip()
        
        # Extract action tips
        action_tips_match = re.search(r'###\s+\*\*Action Tips?\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        action_tips = []
        if action_tips_match:
            tips_text = action_tips_match.group(1)
            for line in tips_text.split('\n'):
                line = line.strip()
                if line and line.startswith('-') and not line.startswith('- [') and line not in ['---', '--']:
                    tip = re.sub(r'^-\s*', '', line).strip()
                    # Remove bold markers if present
                    tip = re.sub(r'\*\*([^*]+)\*\*', r'\1', tip)
                    if tip:
                        action_tips.append(tip)
        
        # Extract motivation nudge
        motivation_match = re.search(r'###\s+\*\*Motivation Nudge\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        motivation_nudge = ''
        if motivation_match:
            motivation_nudge = motivation_match.group(1).strip()
            motivation_nudge = re.sub(r'\n*---\s*\n*$', '', motivation_nudge, flags=re.MULTILINE).strip()
            # Remove bold markers
            motivation_nudge = re.sub(r'\*\*([^*]+)\*\*', r'\1', motivation_nudge)
        
        # Extract habit strategy
        habit_strategy_match = re.search(r'###\s+\*\*Habit Strategy[^\n]*\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        habit_strategy = None
        if habit_strategy_match:
            strategy_text = habit_strategy_match.group(1)
            principle_match = re.search(r'\*\*(?:Strategy|Principle):\*\*\s*([^\n]+)', strategy_text)
            explanation_match = re.search(r'\*\*Explanation:\*\*\s*([^\n]+)', strategy_text)
            example_match = re.search(r'\*\*Example:\*\*\s*([^\n]+)', strategy_text)
            tip_match = re.search(r'\*\*Habit Tip:\*\*\s*([^\n]+)', strategy_text)
            
            if principle_match or explanation_match or example_match or tip_match:
                habit_strategy = {
                    'principle': principle_match.group(1).strip() if principle_match else '',
                    'explanation': explanation_match.group(1).strip() if explanation_match else '',
                    'example': example_match.group(1).strip() if example_match else '',
                    'habit_tip': tip_match.group(1).strip() if tip_match else '',
                }
        
        # Extract follow-up question(s)
        follow_up_match = re.search(r'###\s+\*\*Follow-Up Questions?\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        follow_up_question = ''
        if follow_up_match:
            follow_up_text = follow_up_match.group(1).strip()
            follow_up_text = re.sub(r'\n*---\s*\n*$', '', follow_up_text, flags=re.MULTILINE).strip()
            # Handle multiple questions - take first one
            if follow_up_text.startswith('-'):
                questions = [q.strip() for q in follow_up_text.split('\n') if q.strip().startswith('-') and q.strip() != '---']
                if questions:
                    follow_up_question = questions[0].replace('-', '').strip()
                    # Remove bold markers
                    follow_up_question = re.sub(r'\*\*([^*]+)\*\*', r'\1', follow_up_question)
            else:
                follow_up_question = follow_up_text
                # Remove bold markers
                follow_up_question = re.sub(r'\*\*([^*]+)\*\*', r'\1', follow_up_question)
        
        # Extract intent patterns
        intent_patterns_match = re.search(r'###\s+\*\*Intent Patterns?\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        intent_patterns = []
        if intent_patterns_match:
            patterns_text = intent_patterns_match.group(1)
            for line in patterns_text.split('\n'):
                line = line.strip()
                # Skip headers like "PRIMARY INTENTS"
                if line and line.startswith('-') and not line.startswith('- [') and not re.match(r'^-\s*[A-Z\s]+INTENTS?', line):
                    pattern = re.sub(r'^-\s*', '', line).strip()
                    # Remove trailing notes in brackets
                    pattern = re.sub(r'\s*\[\+.*?\]\s*$', '', pattern).strip()
                    if pattern and len(pattern) >= 3:
                        intent_patterns.append(pattern)
        
        # Extract keywords
        keywords_match = re.search(r'###\s+\*\*Keywords?\*\*\s*\n(.*?)(?=\n###\s+\*\*|\n---\s*$|$)', section, re.DOTALL | re.MULTILINE)
        keywords = []
        if keywords_match:
            keywords_text = keywords_match.group(1)
            for line in keywords_text.split('\n'):
                line = line.strip()
                # Skip category headers, shared/route notes, and empty lines
                if line and line.startswith('-') and not re.search(r'\[shared|\[→', line) and line not in ['---', '--']:
                    keyword = re.sub(r'^-\s*', '', line).strip()
                    # Remove shared/route notes
                    keyword = re.sub(r'\s*\[shared.*?\]\s*$', '', keyword).strip()
                    keyword = re.sub(r'\s*\[→.*?\]\s*$', '', keyword).strip()
                    # Skip category headers like "**Core Nutrition Concepts**"
                    if keyword and not keyword.startswith('**') and not keyword.endswith('**'):
                        keywords.append(keyword)
        
        # Build YAML section
        yaml_section = '---\n'
        yaml_section += f'persona: "{persona}"\n'
        yaml_section += f'topic: "{topic}"\n'
        yaml_section += f'subtopic: "{subtopic}"\n\n'
        
        yaml_section += 'content_text: |\n'
        if content_text:
            for line in content_text.split('\n'):
                yaml_section += f'  {line}\n'
        else:
            yaml_section += '\n'
        
        if action_tips:
            yaml_section += '\naction_tips:\n'
            for tip in action_tips:
                tip_escaped = tip.replace('"', '\\"').replace('\n', ' ')
                yaml_section += f'  - "{tip_escaped}"\n'
        
        if motivation_nudge:
            motivation_escaped = motivation_nudge.replace('"', '\\"').replace('\n', ' ')
            yaml_section += f'\nmotivation_nudge: "{motivation_escaped}"\n'
        
        if habit_strategy and (habit_strategy.get('principle') or habit_strategy.get('explanation')):
            yaml_section += '\nhabit_strategy:\n'
            if habit_strategy.get('principle'):
                principle_escaped = habit_strategy['principle'].replace('"', '\\"')
                yaml_section += f'  principle: "{principle_escaped}"\n'
            if habit_strategy.get('explanation'):
                explanation_escaped = habit_strategy['explanation'].replace('"', '\\"')
                yaml_section += f'  explanation: "{explanation_escaped}"\n'
            if habit_strategy.get('example'):
                example_escaped = habit_strategy['example'].replace('"', '\\"')
                yaml_section += f'  example: "{example_escaped}"\n'
            if habit_strategy.get('habit_tip'):
                tip_escaped = habit_strategy['habit_tip'].replace('"', '\\"')
                yaml_section += f'  habit_tip: "{tip_escaped}"\n'
        
        if follow_up_question:
            follow_up_escaped = follow_up_question.replace('"', '\\"').replace('\n', ' ')
            yaml_section += f'\nfollow_up_question: "{follow_up_escaped}"\n'
        
        if intent_patterns:
            yaml_section += '\nintent_patterns:\n'
            for pattern in intent_patterns:
                pattern_escaped = pattern.replace('"', '\\"')
                yaml_section += f'  - "{pattern_escaped}"\n'
        
        if keywords:
            yaml_section += '\nkeywords:\n'
            for keyword in keywords:
                keyword_escaped = keyword.replace('"', '\\"')
                yaml_section += f'  - "{keyword_escaped}"\n'
        
        yaml_section += '---\n\n'
        yaml_sections.append(yaml_section)
    
    return ''.join(yaml_sections)

# Convert files
kb_dir = os.path.join(os.path.dirname(__file__), '..', 'knowledge-base')
files_to_convert = [
    'Metabolic Changes & Weight Gain.md',
    'Sleep Disturbances.md',
]

for filename in files_to_convert:
    file_path = os.path.join(kb_dir, filename)
    if os.path.exists(file_path):
        print(f'Converting {filename}...')
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        yaml_content = convert_markdown_to_yaml(content)
        if yaml_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(yaml_content)
            print(f'Converted {filename} - {len(yaml_content)} characters written')
        else:
            print(f'Warning: No content generated for {filename}')
    else:
        print(f'Warning: {filename} not found')

print('Conversion complete!')
