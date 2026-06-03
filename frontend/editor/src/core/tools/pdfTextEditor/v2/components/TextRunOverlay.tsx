import { useEffect, useRef, useState } from "react";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";
import { toCssHex } from "@app/tools/pdfTextEditor/v2/model/Color";

// React + contentEditable do not play well together when JSX manages the
// element's children: React reconciles the children on every render and can
// blow away mid-typing input. The fix is to render an empty element and
// drive its `innerText` from a `useEffect` that respects focus.

/**
 * Map a font id like "base14:Helvetica-Bold" or "pdf:1234:Arial" to a
 * CSS font-family stack that visually approximates the PDFium-rendered
 * glyphs while the user is typing. Source PDF fonts aren't web-loaded,
 * so the closest match comes from common system stacks.
 */
function cssFontFamilyFor(fontId: string): string {
  const idx = fontId.lastIndexOf(":");
  const family = idx >= 0 ? fontId.slice(idx + 1) : fontId;
  const lc = family.toLowerCase();
  if (
    lc.includes("times") ||
    lc.includes("serif") ||
    lc.includes("liberation serif") ||
    lc.includes("dejavu serif")
  ) {
    return '"Liberation Serif", "Times New Roman", Times, serif';
  }
  if (lc.includes("courier") || lc.includes("mono")) {
    return '"Liberation Mono", "Courier New", Courier, monospace';
  }
  return '"Liberation Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
}

function cssWeightFor(fontId: string): number {
  return /bold/i.test(fontId) ? 700 : 400;
}

function cssStyleFor(fontId: string): "italic" | "normal" {
  return /italic|oblique/i.test(fontId) ? "italic" : "normal";
}

/**
 * Pick an editing-mask color that always contrasts with the text fill.
 * White text on a white mask would be invisible; perceived-luminance
 * picks white-for-dark-text and dark-for-light-text.
 */
function contrastingMaskFor(fill: {
  r: number;
  g: number;
  b: number;
  a: number;
}): string {
  // ITU-R BT.601 luma; 0 = black, 255 = white.
  const luma = (fill.r * 299 + fill.g * 587 + fill.b * 114) / 1000;
  return luma > 160 ? "rgba(30, 30, 30, 0.85)" : "rgba(255, 255, 255, 0.9)";
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

/**
 * Measure each line of `text` at the given CSS font / size and return
 * the widest one in CSS pixels. PDF metrics and CSS metrics diverge
 * (Arial fallback is wider than the source Helvetica), so the overlay
 * must be sized to the CSS-measured max - otherwise the last word of
 * each line wraps onto a new visual row and a 6-line paragraph reads
 * as 10 lines.
 */
function measureMaxLineWidth(
  text: string,
  fontFamily: string,
  fontWeight: number,
  fontStyle: string,
  fontSizePx: number,
): number {
  if (typeof document === "undefined") return 0;
  if (!sharedMeasureCanvas)
    sharedMeasureCanvas = document.createElement("canvas");
  const ctx = sharedMeasureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    const w = ctx.measureText(line).width;
    if (w > max) max = w;
  }
  return max;
}

/**
 * Measure the font's ascent / descent (px) for the given CSS font, so the
 * overlay can place its first text line's alphabetic baseline exactly on
 * the PDF baseline. Falls back to typical sans ratios if the browser
 * doesn't expose `fontBoundingBox*` (it does in Chromium).
 */
function measureFontMetrics(
  fontFamily: string,
  fontWeight: number,
  fontStyle: string,
  fontSizePx: number,
): { ascent: number; descent: number } {
  const fallback = { ascent: 0.8 * fontSizePx, descent: 0.2 * fontSizePx };
  if (typeof document === "undefined") return fallback;
  if (!sharedMeasureCanvas)
    sharedMeasureCanvas = document.createElement("canvas");
  const ctx = sharedMeasureCanvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const m = ctx.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  if (typeof ascent !== "number" || typeof descent !== "number") {
    return fallback;
  }
  return { ascent, descent };
}

/**
 * Read the editable element's hard-break text.
 *
 * `innerText` already represents user-typed Enter as `\n`. We deliberately
 * do NOT synthesise newlines for browser soft-wraps: the wrap point in CSS
 * is determined by Liberation Sans / Arial advance widths, which diverge
 * from the source PDF font by 5-20%. Inserting a `\n` at the CSS wrap
 * point persists a hard break the user never typed; after save + reload
 * the paragraph reads with phantom breaks and the next edit compounds the
 * drift. Hard-break-only is the only round-trip-safe choice.
 */
function extractHardBreaks(element: HTMLElement): string {
  return element.innerText.replace(/\u00A0/g, " ");
}

interface TextRunOverlayProps {
  run: TextRunSnapshot;
  pageHeight: number;
  scale: number;
  /** "grow": box widens to the right. "wrap": locked width, wraps down. */
  widthMode: WidthMode;
  selected: boolean;
  /** True when this run is the active find-match (yellow highlight). */
  highlighted?: boolean;
  onSelect: (shiftKey: boolean) => void;
  onEdit: (nextText: string) => void;
  /** Fires when the user Ctrl+drags the run to a new position. dx/dy are PDF points. */
  onMove?: (dx: number, dy: number) => void;
}

/**
 * One editable HTML element per PDF text run.
 *
 * Position is computed by converting the run's PDF-space bounds (origin
 * lower-left) into CSS pixels (origin upper-left).
 */
export function TextRunOverlay({
  run,
  pageHeight,
  scale,
  widthMode,
  selected,
  highlighted,
  onSelect,
  onEdit,
  onMove,
}: TextRunOverlayProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Ctrl+drag-to-move state. `dragOffset` is the live cursor delta (px)
  // applied as a CSS transform so the box follows the cursor during the
  // drag; it's committed to a real move (and reset) on mouseup.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Sync the contenteditable's text with the snapshot on external
  // changes (undo/redo, multi-select). We never render the text via
  // JSX children - React fights contentEditable when it does.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerText !== run.text) el.innerText = run.text;
  }, [run.text]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerText === "") el.innerText = run.text;
  }, []);

  const left = run.bounds.x * scale;

  // CSS font for the overlay - derived before the vertical math because
  // baseline placement needs the font's measured ascent.
  const fontFamily = cssFontFamilyFor(run.fontId);
  const fontWeight = cssWeightFor(run.fontId);
  const fontStyle = cssStyleFor(run.fontId);
  const fontSizePx = Math.max(4, run.fontSize * scale);

  // Line height (px). Paragraphs use the measured inter-baseline spacing;
  // single lines get light leading. The same value drives this layout
  // math AND the CSS `line-height`, so per-line baselines stay aligned.
  const lineHeightPx =
    run.paragraphLineHeight && run.paragraphLineHeight > 0
      ? run.paragraphLineHeight * scale
      : fontSizePx * 1.2;

  // VERTICAL PLACEMENT - anchor the first line's CSS alphabetic baseline
  // exactly onto the PDF baseline (`run.matrix.f`). PDFium's bounds.height
  // is only the visible glyph extent, so the old "top = pageHeight -
  // bounds.y - inflatedHeight" placed the top-aligned text well above the
  // real glyph and every run read slightly high. Using the font's real
  // ascent plus the CSS half-leading lands the baseline on the mark, and
  // because line spacing matches paragraphLineHeight every subsequent
  // line lines up too.
  const { ascent, descent } = measureFontMetrics(
    fontFamily,
    fontWeight,
    fontStyle,
    fontSizePx,
  );
  const halfLeading = Math.max(0, (lineHeightPx - (ascent + descent)) / 2);
  const firstBaselineFromTop = halfLeading + ascent;
  const baselineScreen = (pageHeight - run.matrix.f) * scale;
  const top = baselineScreen - firstBaselineFromTop;

  // Height covers every (typed) line plus descender slack, so the
  // contenteditable hit area matches what's drawn and typed extra lines
  // aren't clipped by `overflow: hidden`.
  const lineCount = Math.max(1, run.text.split(/\r?\n/).length);
  const height = lineCount * lineHeightPx + descent;

  const pdfWidth = run.bounds.width * scale;
  // Widen the overlay so every source line still fits in CSS metrics
  // (the Arial fallback is slightly wider than the source font), and so
  // typed text wider than the original bounds isn't clipped.
  const measuredWidth = measureMaxLineWidth(
    run.text,
    fontFamily,
    fontWeight,
    fontStyle,
    fontSizePx,
  );
  // Width behaviour is user-controlled:
  //  - "grow": box widens to the right to fit the content (no wrap).
  //  - "wrap": box width is LOCKED to the source width; content word-
  //    wraps and the box grows downward instead. A small floor keeps
  //    very narrow source runs usable.
  const isParagraph = (run.paragraphLineCount ?? 1) > 1;
  const wrapMode = widthMode === "wrap";
  const width = wrapMode
    ? Math.max(pdfWidth, fontSizePx * 3)
    : Math.max(pdfWidth, measuredWidth + fontSizePx);
  // `min-height` (not a fixed height) is used below, so in BOTH modes the
  // box grows downward when content needs it. The mode only changes
  // whether the width is locked (wrap) or free (grow), and whether single
  // lines wrap.
  const whiteSpace: "pre" | "pre-wrap" =
    wrapMode || isParagraph ? "pre-wrap" : "pre";

  return (
    <div
      ref={ref}
      data-testid={`v2-run-${run.id}`}
      contentEditable
      suppressContentEditableWarning
      onMouseDown={(e) => {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && onMove) {
          dragOriginRef.current = { x: e.clientX, y: e.clientY };
          setDragging(true);
          setDragOffset({ x: 0, y: 0 });
          (e.currentTarget as HTMLDivElement).blur();
          // Live preview: translate the box with the cursor while dragging.
          const onMouseMove = (ev: MouseEvent) => {
            const origin = dragOriginRef.current;
            if (!origin) return;
            setDragOffset({
              x: ev.clientX - origin.x,
              y: ev.clientY - origin.y,
            });
          };
          const onMouseUp = (ev: MouseEvent) => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            setDragging(false);
            setDragOffset(null);
            const origin = dragOriginRef.current;
            dragOriginRef.current = null;
            if (!origin) return;
            const dx = (ev.clientX - origin.x) / scale;
            const dy = -(ev.clientY - origin.y) / scale; // PDF y is inverted
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            onMove(dx, dy);
          };
          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
          return;
        }
        (e.currentTarget as HTMLDivElement).focus();
        onSelect(e.shiftKey);
      }}
      onFocus={(e) => {
        setFocused(true);
        // Place caret at end so typed keys route into the element.
        const el = e.currentTarget as HTMLDivElement;
        const sel = window.getSelection();
        if (!sel) return;
        if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }}
      onBlur={() => setFocused(false)}
      onInput={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        // Always read hard breaks only - never synthesise newlines from
        // browser soft-wraps. Visual CSS wraps come from Liberation Sans
        // advance widths, which differ from the source PDF font; inserting
        // a `\n` at the CSS wrap persists a hard break the user never
        // typed. Strip NBSP (U+00A0) because base-14 Helvetica maps it to
        // 0xFF (ydieresis) and renders as junk through PDFium SetText.
        const raw = extractHardBreaks(el);
        const text = raw.replace(/\u00A0/g, " ");
        onEdit(text);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left,
        top,
        width,
        minHeight: height,
        // Live Ctrl+drag preview: follow the cursor via transform, and
        // float above siblings + dim slightly so the move reads clearly.
        transform: dragOffset
          ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
          : undefined,
        opacity: dragging ? 0.75 : 1,
        zIndex: dragging ? 20 : undefined,
        transition: dragging ? "none" : "transform 80ms ease-out",
        // While focused: real glyphs in a CSS-stack approximation of
        // the PDFium font, so the user sees their input before the
        // bitmap re-renders. While unfocused: transparent so the PDFium
        // bitmap shows through (the source of truth between edits).
        fontFamily,
        fontWeight,
        fontStyle,
        fontSize: fontSizePx,
        // Same line-height used in the baseline math above, so the CSS
        // baselines land exactly where we computed `top`.
        lineHeight: `${lineHeightPx}px`,
        whiteSpace,
        // Show the glyphs while focused OR mid-drag so the Ctrl+drag
        // preview is a visible chip that follows the cursor.
        color: focused || dragging ? toCssHex(run.fill) : "transparent",
        // Mask the underlying bitmap while editing. Light text needs a
        // dark mask and vice versa - white text on a white mask would
        // be invisible. Use the perceived luminance of the text color
        // to pick which side of the contrast to land on.
        backgroundColor: focused
          ? contrastingMaskFor(run.fill)
          : highlighted
            ? "rgba(255,217,0,0.45)"
            : selected
              ? "rgba(44,123,229,0.08)"
              : hovered
                ? "rgba(44,123,229,0.03)"
                : "transparent",
        caretColor: toCssHex(run.fill),
        outline: dragging
          ? "1px dashed #2c7be5"
          : selected
            ? "1px solid #2c7be5"
            : hovered
              ? "1px dashed rgba(44,123,229,0.6)"
              : "1px dashed transparent",
        cursor: "text",
        pointerEvents: "auto",
        userSelect: "text",
        padding: 0,
        margin: 0,
        overflow: "hidden",
      }}
    />
  );
}
