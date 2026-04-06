/**
 * SimpleMarkdown — lightweight markdown renderer for agent chat responses.
 *
 * Handles: headings (##), bold (**), italic (*), inline code (`),
 * numbered lists, bullet lists, and paragraphs.
 * No external dependencies.
 */

import React from 'react';

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      nodes.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5]) {
      nodes.push(<code key={key++} className="md-inline-code">{match[6]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → skip
    if (!trimmed) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const inner = parseInline(headingMatch[2]);
      const cls = `md-h${level}`;
      if (level === 1) elements.push(<h1 key={key++} className={cls}>{inner}</h1>);
      else if (level === 2) elements.push(<h2 key={key++} className={cls}>{inner}</h2>);
      else if (level === 3) elements.push(<h3 key={key++} className={cls}>{inner}</h3>);
      else elements.push(<h4 key={key++} className={cls}>{inner}</h4>);
      i++;
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+[.)]\s+/, '');
        items.push(<li key={key++}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(<ol key={key++} className="md-ol">{items}</ol>);
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(<li key={key++}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(<ul key={key++} className="md-ul">{items}</ul>);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="md-p">{parseInline(trimmed)}</p>
    );
    i++;
  }

  return <div className={className}>{elements}</div>;
}
