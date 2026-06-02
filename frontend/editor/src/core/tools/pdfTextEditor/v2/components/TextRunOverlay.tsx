import { useEffect, useRef, useState } from "react";
import type { TextRunSnapshot } from "@app/tools/pdfTextEditor/v2/types";
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
 * Walk a contentEditable element character-by-character and detect
 * soft line wraps (where the browser broke a line because the next
 * word didn't fit). Each transition between Y rows becomes a `\n`.
 * Combined with the user's hard breaks (Enter inserts a real `\n`),
 * the returned string captures every visual line of the rendered
 * paragraph - which is what EditTextCommand needs to emit one
 * PDFium text object per line.
 */
function extractTextWithSoftBreaks(element: HTMLElement): string {
  const normalized = element.innerText.replace(/\u00A0/g, " ");
  if (!element.isConnected) return normalized;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const range = document.createRange();
  let result = "";
  let previousTop: number | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeText = node.textContent ?? "";
    for (let index = 0; index < nodeText.length; index += 1) {
      const char = nodeText[index];
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (
        previousTop !== null &&
        rect &&
        Math.abs(rect.top - previousTop) > 0.5 &&
        result[result.length - 1] !== "\n"
      ) {
        result += "\n";
      }
      result += char;
      if (rect) previousTop = rect.top;
    }
  }
  return result || normalized;
}

interface TextRunOverlayProps {
  run: TextRunSnapshot;
  pageHeight: number;
  scale: number;
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
  selected,
  highlighted,
  onSelect,
  onEdit,
  onMove,
}: TextRunOverlayProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Ctrl+drag-to-move state.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

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
  // PDFium-reported bounds.height only captures the visible glyph
  // extent (often x-height for lowercase-heavy runs, not cap+descender),
  // so a line of body text often reports height=3pt for a 12pt font.
  // Use max(bounds.height, fontSize*1.1) so the overlay covers the full
  // line vertically and the contenteditable hit area lines up with what
  // the user sees in the bitmap. Multi-line paragraphs already report a
  // sensible height so the max is harmless for them.
  const boxHeightPt = Math.max(
    run.bounds.height,
    run.fontSize * 1.1,
    run.paragraphLineHeight ?? 0,
  );
  const top = (pageHeight - run.bounds.y - boxHeightPt) * scale;
  const pdfWidth = run.bounds.width * scale;
  const height = boxHeightPt * scale;

  // Paragraphs: widen the overlay enough that every source line still
  // fits in CSS metrics. Without this the Arial fallback's slightly
  // wider glyphs make each line's last word wrap onto a new visual row.
  const fontFamily = cssFontFamilyFor(run.fontId);
  const fontWeight = cssWeightFor(run.fontId);
  const fontStyle = cssStyleFor(run.fontId);
  const fontSizePx = Math.max(4, run.fontSize * scale);
  const measuredWidth = measureMaxLineWidth(
    run.text,
    fontFamily,
    fontWeight,
    fontStyle,
    fontSizePx,
  );
  // Width policy:
  //   - Focused (user is typing): add a one-em buffer past the
  //     measured text width so the caret has room to advance one more
  //     char before the overlay clips and the next keystroke gets
  //     swallowed by `overflow: hidden`.
  //   - Unfocused / selected / hovered: hug the actual text width. A
  //     stale wider box (from an earlier longer state) makes the
  //     selection rectangle and hover affordance read as "there's
  //     invisible content here" - the user reported the textbox
  //     "doesn't have the same width as the text", which is this.
  // pdfWidth is still the floor in both modes so a freshly-emitted run
  // doesn't undershoot the bitmap's actual rendered glyph extent.
  const buffer = focused ? fontSizePx : 0;
  const width = Math.max(pdfWidth, measuredWidth + buffer);

  return (
    <div
      ref={ref}
      data-testid={`v2-run-${run.id}`}
      contentEditable={!run.locked}
      suppressContentEditableWarning
      data-locked={run.locked ? "true" : undefined}
      title={run.locked ? "Locked - use the Unlock button to edit" : undefined}
      onMouseDown={(e) => {
        e.stopPropagation();
        // Locked runs are inert: no select, no drag, no edit. They
        // remain visible (the PDFium bitmap renders the source glyphs)
        // and hit-test-able only as a no-op blocker so the user can
        // tell something is there - but no command fires.
        if (run.locked) return;
        if ((e.ctrlKey || e.metaKey) && onMove) {
          dragOriginRef.current = { x: e.clientX, y: e.clientY };
          setDragging(true);
          (e.currentTarget as HTMLDivElement).blur();
          const onMouseUp = (ev: MouseEvent) => {
            window.removeEventListener("mouseup", onMouseUp);
            setDragging(false);
            const origin = dragOriginRef.current;
            dragOriginRef.current = null;
            if (!origin) return;
            const dx = (ev.clientX - origin.x) / scale;
            const dy = -(ev.clientY - origin.y) / scale; // PDF y is inverted
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            onMove(dx, dy);
          };
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
        if (sel && !(sel.rangeCount > 0 && el.contains(sel.anchorNode))) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Backend strategy: pre-warm the per-char charcode cache for the
        // whole page in the background. By the time the user types their
        // first char, the cache is populated and the per-char emit branch
        // in editTextHelpers fires on the FIRST keystroke - no more
        // "type once for Helvetica, retype for the real font" UX. This
        // is a one-shot per page per session (idempotent guard in
        // BackendResolver).
        void (async () => {
          try {
            const [
              { getActiveCharcodeStrategy },
              { prewarmBackendCacheForPage },
            ] = await Promise.all([
              import("@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy"),
              import("@app/tools/pdfTextEditor/v2/charcode/charcodeRegistry"),
            ]);
            if (getActiveCharcodeStrategy() !== "backend") return;
            await prewarmBackendCacheForPage(run.pageIndex);
          } catch {
            /* prewarm is best-effort, never block focus */
          }
        })();
      }}
      onBlur={() => setFocused(false)}
      onInput={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        // Paragraphs preserve soft-wrap line breaks so the commit can
        // emit one PDF text object per visual line. Always strip NBSP
        // (U+00A0): browsers can substitute it for a typed Space at
        // word boundaries to preserve the visual gap, but PDFium's
        // base-14 Helvetica maps U+00A0 to 0xFF (ydieresis), so any
        // NBSP that survives to PDFium SetText renders as junk.
        const isParagraph = (run.paragraphLineCount ?? 1) > 1;
        const raw = isParagraph ? extractTextWithSoftBreaks(el) : el.innerText;
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
        // While focused: real glyphs in a CSS-stack approximation of
        // the PDFium font, so the user sees their input before the
        // bitmap re-renders. While unfocused: transparent so the PDFium
        // bitmap shows through (the source of truth between edits).
        fontFamily,
        fontWeight,
        fontStyle,
        fontSize: fontSizePx,
        lineHeight: run.paragraphLineHeight
          ? `${run.paragraphLineHeight * scale}px`
          : 1,
        whiteSpace: (run.paragraphLineCount ?? 1) > 1 ? "pre-wrap" : "pre",
        color: focused ? toCssHex(run.fill) : "transparent",
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
