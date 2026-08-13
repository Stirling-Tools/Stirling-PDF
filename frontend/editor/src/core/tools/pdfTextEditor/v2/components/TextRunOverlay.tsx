import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";
import { toCssHex } from "@app/tools/pdfTextEditor/v2/model/Color";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import {
  resolveLang,
  useSpellcheckPreference,
} from "@app/tools/pdfTextEditor/v2/util/spellcheck";
import {
  buildExactLines,
  type ExactLine,
} from "@app/tools/pdfTextEditor/v2/util/exactLayout";

// React + contentEditable do not play well together when JSX manages the
// element's children: React reconciles the children on every render and can.

// Map a font id like "base14:Helvetica-Bold" or "pdf:1234:Arial" to a CSS
// font-family stack that visually approximates the PDFium-rendered glyphs.
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

/** Pick an editing-mask color that always contrasts with the text fill. */
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

// Measure each line of `text` at the given CSS font / size and return the
// widest one in CSS pixels.
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

/** Measure the font's ascent / descent for the given CSS font. */
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

// Read the editable element's hard-break text. `innerText` already represents
// user-typed Enter as `\n`.
function extractHardBreaks(element: HTMLElement): string {
  return element.innerText.replace(/\u00A0/g, " ");
}

const LINE_BREAK = String.fromCharCode(10);

// One inline-block box per word at the engine's own advance, so words sit back
// on the glyphs underneath. `innerText` still round-trips through it.
function paintExactLines(
  el: HTMLElement,
  lines: ExactLine[],
  originX: number,
  scale: number,
): void {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createTextNode(LINE_BREAK));
    // A line may start right of the box origin (an indent, or a centred
    // line), and that offset is part of what the capture preserves.
    const indent = (line.left - originX) * scale;
    if (indent > 0.5) fragment.appendChild(box("", indent));
    for (const token of line.tokens) {
      fragment.appendChild(box(token.text, token.width * scale));
    }
  });
  el.replaceChildren(fragment);
}

function box(text: string, width: number): HTMLSpanElement {
  const span = document.createElement("span");
  span.style.display = "inline-block";
  span.style.width = `${Math.max(0, width)}px`;
  span.style.whiteSpace = "pre";
  span.dataset.exact = "1";
  if (text) span.textContent = text;
  return span;
}

/** Caret offset in plain-text terms, so flattening can restore it. */
function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const probe = range.cloneRange();
  probe.selectNodeContents(el);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

function setCaret(el: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (seen + len >= offset) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, offset - seen));
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    seen += len;
    node = walker.nextNode() as Text | null;
  }
}

interface TextRunOverlayProps {
  run: TextRunSnapshot;
  pageHeight: number;
  /** Page width in PDF points - caps the box so it never runs off-page. */
  pageWidth: number;
  /** Raw-PDF -> display (CropBox/rotation) transform. */
  transform: DisplayTransform;
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
  // Fires on blur in Wrap mode when the edited content overflows the locked box
  // width.
  onWrap?: (maxWidthPt: number) => void;
}

/** One editable HTML element per PDF text run. */
export function TextRunOverlay({
  run,
  pageHeight,
  pageWidth,
  transform,
  scale,
  widthMode,
  selected,
  highlighted,
  onSelect,
  onEdit,
  onMove,
  onWrap,
}: TextRunOverlayProps) {
  const { t } = useTranslation();
  // Subscribed, so toggling the preference re-renders every overlay.
  const spellcheck = useSpellcheckPreference();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // True between compositionstart and compositionend (IME). While composing
  // onInput must not dispatch per-keystroke edits; we commit once on end.
  const composingRef = useRef(false);
  // Text content captured when the box gains focus, so blur can tell whether
  // the user actually edited it (and a Wrap reflow is warranted).
  const focusTextRef = useRef<string>("");
  // Ctrl+drag-to-move state. `dragOffset` is the live cursor delta applied as a
  // CSS transform so the box follows the cursor during the drag.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  // The run's text and bounds width on first render - the stable baselines for
  // the wrap-mode lock width (see below).
  const originalTextRef = useRef<string>(run.text);
  const originalBoundsWidthRef = useRef<number>(run.bounds.width);
  // Whether this run was a real (multi-line) paragraph when it first mounted.
  const wasParagraphRef = useRef<boolean>((run.paragraphLineCount ?? 1) > 1);
  // True while the box is showing engine-exact word boxes; the first edit
  // flattens them because a typed character would overflow its fixed box.
  const exactPaintedRef = useRef(false);

  // Single-line runs only: fixed-width boxes fight a paragraph's wrap,
  // manual-break and re-flow paths, which rewrite this element constantly.
  const exactLines =
    run.charStartsX && run.charEndsX && (run.paragraphLineCount ?? 1) <= 1
      ? buildExactLines(run.text, {
          starts: run.charStartsX,
          ends: run.charEndsX,
        })
      : null;

  const flattenExact = (el: HTMLDivElement): void => {
    if (!exactPaintedRef.current) return;
    exactPaintedRef.current = false;
    const offset = caretOffset(el);
    el.innerText = extractHardBreaks(el);
    if (offset !== null) setCaret(el, offset);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !focused || !exactLines) return;
    if (exactPaintedRef.current) return;
    if (extractHardBreaks(el) !== run.text) return;
    const offset = caretOffset(el);
    paintExactLines(el, exactLines, run.bounds.x, scale);
    exactPaintedRef.current = true;
    if (offset !== null) setCaret(el, offset);
  });

  // Sync the contenteditable's text with the snapshot on external changes
  // (undo/redo, multi-select).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerText !== run.text) {
      exactPaintedRef.current = false;
      el.innerText = run.text;
    }
  }, [run.text]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerText === "") el.innerText = run.text;
  }, []);

  // Map the run's raw-PDF anchor (left edge x, baseline f) into display-PDF
  // space (CropBox/rotation).
  const anchor = transform.apply(run.bounds.x, run.matrix.f);
  const left = anchor.x * scale;

  // CSS font for the overlay - derived before the vertical math because
  // baseline placement needs the font's measured ascent.
  const fontFamily = cssFontFamilyFor(run.fontId);
  const fontWeight = cssWeightFor(run.fontId);
  const fontStyle = cssStyleFor(run.fontId);
  const fontSizePx = Math.max(4, run.fontSize * scale);

  // Line height (px).
  const lineHeightPx =
    run.paragraphLineHeight && run.paragraphLineHeight > 0
      ? run.paragraphLineHeight * scale
      : fontSizePx * 1.2;

  // VERTICAL PLACEMENT - anchor the first line's CSS alphabetic baseline
  // exactly onto the PDF baseline (`run.matrix.f`).
  const { ascent, descent } = measureFontMetrics(
    fontFamily,
    fontWeight,
    fontStyle,
    fontSizePx,
  );
  const halfLeading = Math.max(0, (lineHeightPx - (ascent + descent)) / 2);
  const firstBaselineFromTop = halfLeading + ascent;
  const baselineScreen = (pageHeight - anchor.y) * scale;
  const top = baselineScreen - firstBaselineFromTop;

  // Height covers every line plus descender slack.
  const lineCount = Math.max(1, run.text.split(/\r?\n/).length);
  const height = lineCount * lineHeightPx + descent;

  const pdfWidth = run.bounds.width * scale;
  // Widen the overlay so every source line still fits in CSS metrics, and so
  // typed text wider than the original bounds isn't clipped.
  const measuredWidth = measureMaxLineWidth(
    run.text,
    fontFamily,
    fontWeight,
    fontStyle,
    fontSizePx,
  );
  // Width behaviour is user-controlled: - "grow": box widens to the right to
  // fit the content.
  const isParagraph = (run.paragraphLineCount ?? 1) > 1;
  const wrapMode = widthMode === "wrap";
  // Wrap-mode lock width.
  const wrapLockWidth = Math.max(
    originalBoundsWidthRef.current * scale,
    measureMaxLineWidth(
      originalTextRef.current,
      fontFamily,
      fontWeight,
      fontStyle,
      fontSizePx,
    ) +
      fontSizePx * 0.5,
  );
  // A multi-line paragraph always WRAPS - it is body text, not a single-line
  // label. "grow" only applies to genuine single-line runs.
  const wantWrap = wrapMode || isParagraph;
  // Never let the box extend past the page's right edge.
  const maxOnPageWidth = Math.max(fontSizePx * 4, pageWidth * scale - left - 4);
  const naturalWidth = wantWrap
    ? wrapLockWidth
    : Math.max(pdfWidth, measuredWidth + fontSizePx);
  const width = Math.min(naturalWidth, maxOnPageWidth);
  // `min-height` (not a fixed height) is used below, so the box grows DOWNWARD
  // when content needs it.
  const whiteSpace: "pre" | "pre-wrap" =
    wantWrap || width < naturalWidth - 0.5 ? "pre-wrap" : "pre";

  // Which dictionary the browser should load. "auto" falls back to the
  // page's own language, which is what the element would inherit anyway.
  const spellcheckLang = resolveLang(
    spellcheck,
    typeof document === "undefined" ? null : document.documentElement.lang,
  );

  return (
    <div
      ref={ref}
      data-testid={`v2-run-${run.id}`}
      contentEditable={!run.locked}
      suppressContentEditableWarning
      spellCheck={spellcheck.enabled}
      lang={spellcheckLang ?? undefined}
      data-locked={run.locked ? "true" : undefined}
      title={
        run.locked
          ? t(
              "pdfTextEditorV2.run.lockedTitle",
              "Locked - use the Unlock button to edit",
            )
          : undefined
      }
      onPaste={(e) => {
        // Paste as PLAIN TEXT.
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain");
        if (text) document.execCommand("insertText", false, text);
      }}
      onPointerDown={(e) => {
        // Ctrl+Shift+drag is the marquee multi-select gesture.
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
        e.stopPropagation();
        // Locked runs are inert: no select, no drag, no edit.
        if (run.locked) return;
        if ((e.ctrlKey || e.metaKey) && onMove) {
          dragOriginRef.current = { x: e.clientX, y: e.clientY };
          setDragging(true);
          setDragOffset({ x: 0, y: 0 });
          (e.currentTarget as HTMLDivElement).blur();
          // Pointer events (mouse/pen/touch) with a global capture so the
          // drag keeps tracking even if the cursor leaves the overlay.
          const onPointerMove = (ev: PointerEvent) => {
            const origin = dragOriginRef.current;
            if (!origin) return;
            setDragOffset({
              x: ev.clientX - origin.x,
              y: ev.clientY - origin.y,
            });
          };
          const onPointerUp = (ev: PointerEvent) => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            setDragging(false);
            setDragOffset(null);
            const origin = dragOriginRef.current;
            dragOriginRef.current = null;
            if (!origin) return;
            // Screen delta -> display-PDF delta, then invert the linear part of
            // the CropBox/rotation transform to a raw-PDF delta.
            const ddx = (ev.clientX - origin.x) / scale;
            const ddy = -(ev.clientY - origin.y) / scale;
            const v = transform.invertVector(ddx, ddy);
            const dx = v.x;
            const dy = v.y;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            onMove(dx, dy);
          };
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          return;
        }
        // Shift-click EXTENDS the multi-object selection.
        if (e.shiftKey) {
          e.preventDefault();
          onSelect(true);
          return;
        }
        (e.currentTarget as HTMLDivElement).focus();
        onSelect(false);
      }}
      onFocus={(e) => {
        setFocused(true);
        const el = e.currentTarget as HTMLDivElement;
        // Remember the text at focus so blur can tell if the user edited it.
        focusTextRef.current = extractHardBreaks(el);
        // Place caret at end so typed keys route into the element.
        const sel = window.getSelection();
        if (sel && !(sel.rangeCount > 0 && el.contains(sel.anchorNode))) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Backend strategy: pre-warm the per-char charcode cache for the whole
        // page in the background.
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
      onBlur={(e) => {
        flattenExact(e.currentTarget as HTMLDivElement);
        setFocused(false);
        // Wrap mode: when the just-edited content overflows the locked box
        // width.
        if (!wantWrap || !onWrap) return;
        const el = e.currentTarget as HTMLDivElement;
        const domText = extractHardBreaks(el);
        if (domText === focusTextRef.current) return; // not edited
        const widest = measureMaxLineWidth(
          domText,
          fontFamily,
          fontWeight,
          fontStyle,
          fontSizePx,
        );
        // Runs that were paragraphs on mount always re-flow when edited.
        if (!wasParagraphRef.current && widest <= width + 1) return;
        onWrap(width / scale);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // Commit the composed string once, like onInput's non-IME path.
        const el = e.currentTarget as HTMLDivElement;
        onEdit(extractHardBreaks(el).replace(/\u00A0/g, " "));
      }}
      onBeforeInput={(e) => {
        flattenExact(e.currentTarget as HTMLDivElement);
      }}
      onInput={(e) => {
        // Skip intermediate IME steps; compositionend commits the result.
        if (composingRef.current || (e.nativeEvent as InputEvent).isComposing)
          return;
        const el = e.currentTarget as HTMLDivElement;
        // Back to ordinary flow before anything reads the text, or a typed
        // character stays in its fixed-width box and the line can never wrap.
        flattenExact(el);
        // Always read hard breaks only - never synthesise newlines from browser
        // soft-wraps.
        const raw = extractHardBreaks(el);
        const text = raw.replace(/\u00A0/g, " ");
        onEdit(text);
        // No per-keystroke reflow: while focused, the box is CAPPED to the page
        // and wraps via CSS, so the editing view is always on-page.
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
        // Only the opacity settle is animated.
        transition: dragging ? "none" : "opacity 120ms ease-out",
        // While focused: real glyphs in a CSS-stack approximation of the PDFium
        // font, so the user sees their input before the bitmap re-renders.
        fontFamily,
        fontWeight,
        fontStyle,
        fontSize: fontSizePx,
        // Mirror the run's letter-spacing so the editing view tracks the
        // wide-set glyphs underneath.
        letterSpacing: run.charSpacingPt
          ? `${run.charSpacingPt * scale}px`
          : undefined,
        // Same line-height used in the baseline math above, so the CSS
        // baselines land exactly where we computed `top`.
        lineHeight: `${lineHeightPx}px`,
        whiteSpace,
        // Show the glyphs while focused OR mid-drag so the Ctrl+drag
        // preview is a visible chip that follows the cursor.
        color: focused || dragging ? toCssHex(run.fill) : "transparent",
        // Mask the underlying bitmap while editing.
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
