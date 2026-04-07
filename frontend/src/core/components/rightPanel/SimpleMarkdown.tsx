/**
 * SimpleMarkdown — lightweight markdown renderer for agent chat responses.
 *
 * Handles: headings (##), bold (**), italic (*), inline code (`),
 * fenced code blocks (```), numbered lists, bullet lists, horizontal rules,
 * and paragraphs.  No external dependencies.
 */

import React from 'react';

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match: **bold**, *italic*, `code` — code checked first to avoid * inside backticks
  const regex = /(`(.+?)`)|((\*\*|__)(.+?)\4)|((\*|_)(.+?)\7)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // Inline code
      nodes.push(<code key={key++} className="md-inline-code">{match[2]}</code>);
    } else if (match[3]) {
      // Bold
      nodes.push(<strong key={key++}>{match[5]}</strong>);
    } else if (match[6]) {
      // Italic
      nodes.push(<em key={key++}>{match[8]}</em>);
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

    // Fenced code block (``` ... ```)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="md-code-block" data-lang={lang || undefined}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      elements.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const inner = parseInline(headingMatch[2]);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(<Tag key={key++} className={`md-h${level}`}>{inner}</Tag>);
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
