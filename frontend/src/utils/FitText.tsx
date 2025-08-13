import React, { CSSProperties, useMemo, useRef } from 'react';
import { useAdjustFontSizeToFit } from './textFit';

type FitTextProps = {
  text: string;
  fontSize?: number; // px; if omitted, uses computed style
  minimumFontScale?: number; // 0..1
  lines?: number; // max lines
  className?: string;
  style?: CSSProperties;
  as?: 'span' | 'div';
};

const FitText: React.FC<FitTextProps> = ({
  text,
  fontSize,
  minimumFontScale = 0.8,
  lines = 1,
  className,
  style,
  as = 'span',
}) => {
  const ref = useRef<HTMLElement | null>(null);

  // Hook runs after mount and on size/text changes; uses observers internally
  useAdjustFontSizeToFit(ref as any, {
    maxFontSizePx: fontSize,
    minFontScale: minimumFontScale,
    maxLines: lines,
    singleLine: lines === 1,
  });

  // Memoize the HTML tag to render (span/div) from the `as` prop so
  // React doesn't create a new component function on each render.
  const ElementTag: any = useMemo(() => as, [as]);

  const clampStyles: CSSProperties = {
    // Multi-line clamp with ellipsis fallback
    whiteSpace: lines === 1 ? 'nowrap' : 'normal',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: lines > 1 ? ('-webkit-box' as any) : undefined,
    WebkitBoxOrient: lines > 1 ? ('vertical' as any) : undefined,
    WebkitLineClamp: lines > 1 ? (lines as any) : undefined,
    lineClamp: lines > 1 ? (lines as any) : undefined,
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    fontSize: fontSize ? `${fontSize}px` : undefined,
  };

  return (
    <ElementTag ref={ref} className={className} style={{ ...clampStyles, ...style }}>
      {text}
    </ElementTag>
  );
};

export default FitText;


