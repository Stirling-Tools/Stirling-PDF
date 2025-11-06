import React, { CSSProperties, useMemo, useRef } from 'react';
import { useAdjustFontSizeToFit } from '@app/components/shared/fitText/textFit';

type FitTextProps = {
  text: string;
  fontSize?: number; // px; if omitted, uses computed style
  minimumFontScale?: number; // 0..1
  lines?: number; // max lines
  className?: string;
  style?: CSSProperties;
  as?: 'span' | 'div';
  /**
   * Insert zero-width soft breaks after these characters to prefer wrapping at them
   * when multi-line is enabled. Defaults to '/'. Ignored when lines === 1.
   */
  softBreakChars?: string | string[];
};

const FitText: React.FC<FitTextProps> = ({
  text,
  fontSize,
  minimumFontScale = 0.8,
  lines = 1,
  className,
  style,
  as = 'span',
  softBreakChars = ['-','_','/'],
}) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const elementRef = (as === 'div' ? divRef : spanRef) as React.RefObject<HTMLElement | null>;

  // Hook runs after mount and on size/text changes; uses observers internally
  useAdjustFontSizeToFit(elementRef, {
    maxFontSizePx: fontSize,
    minFontScale: minimumFontScale,
    maxLines: lines,
    singleLine: lines === 1,
  });

  // For the / character, insert zero-width soft breaks to prefer wrapping at them
  const displayText = useMemo(() => {
    if (!text) return text;
    if (!lines || lines <= 1) return text;
    const chars = Array.isArray(softBreakChars) ? softBreakChars : [softBreakChars];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${chars.filter(Boolean).map(esc).join('|')})`, 'g');
    return text.replace(re, `$1\u200B`);
  }, [text, lines, softBreakChars]);

  const clampStyles: CSSProperties = {
    // Multi-line clamp with ellipsis fallback
    whiteSpace: lines === 1 ? 'nowrap' : 'normal',
    overflow: 'visible',
    textOverflow: 'ellipsis',
    display: lines > 1 ? '-webkit-box' as CSSProperties['display'] : undefined,
    WebkitBoxOrient: lines > 1 ? 'vertical' as CSSProperties['WebkitBoxOrient'] : undefined,
    WebkitLineClamp: lines > 1 ? lines : undefined,
    lineClamp: lines > 1 ? lines : undefined,
    // Favor shrinking over breaking words; only break at natural spaces or softBreakChars
    wordBreak: lines > 1 ? 'keep-all' : 'normal',
    overflowWrap: 'normal',
    hyphens: 'manual',
    // fontSize expects rem values (e.g., 1.2, 0.9) to scale with global font size
    fontSize: fontSize ? `${fontSize}rem` : undefined,
  };

  const combinedStyle = { ...clampStyles, ...style };

  if (as === 'div') {
    return (
      <div ref={divRef} className={className} style={combinedStyle}>
        {displayText}
      </div>
    );
  }

  return (
    <span ref={spanRef} className={className} style={combinedStyle}>
      {displayText}
    </span>
  );
};

export default FitText;
