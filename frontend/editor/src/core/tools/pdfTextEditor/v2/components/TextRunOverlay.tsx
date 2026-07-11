import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";
import { toCssHex } from "@app/tools/pdfTextEditor/v2/model/Color";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

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
  /** Page width in PDF points - caps the box so it never runs off-page. */
  pageWidth: number;
  /**
   * Raw-PDF -> display (CropBox/rotation) transform. Identity for normal
   * pages; applied to the run's anchor so the overlay lands on the rendered
   * (cropped/rotated) bitmap.
   */
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
  /**
   * Fires on blur in Wrap mode when the edited content overflows the locked
   * box width - asks the editor to reflow the run's glyphs to `maxWidthPt`
   * (PDF points) by repositioning them, so the wrap persists without
   * re-setting (and garbling) the embedded font.
   */
  onWrap?: (maxWidthPt: number) => void;
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
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // True between compositionstart and compositionend (IME). While composing
  // onInput must not dispatch per-keystroke edits; we commit once on end.
  const composingRef = useRef(false);
  // Text content captured when the box gains focus, so blur can tell whether
  // the user actually edited it (and a Wrap reflow is warranted).
  const focusTextRef = useRef<string>("");
  // Ctrl+drag-to-move state. `dragOffset` is the live cursor delta (px)
  // applied as a CSS transform so the box follows the cursor during the
  // drag; it's committed to a real move (and reset) on mouseup.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  // The run's text and bounds width on first render - the stable baselines
  // for the wrap-mode lock width (see below). The component is keyed by
  // run.id, so these refs are per-run and never cross to a different run.
  const originalTextRef = useRef<string>(run.text);
  const originalBoundsWidthRef = useRef<number>(run.bounds.width);
  // Whether this run was a real (multi-line) paragraph when it first
  // mounted. Only those force a re-flow on click-off; a single-line run
  // (e.g. a heading) that merely gained a manual break must NOT be
  // re-flowed - that would collapse its original spacing.
  const wasParagraphRef = useRef<boolean>((run.paragraphLineCount ?? 1) > 1);

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

  // Map the run's raw-PDF anchor (left edge x, baseline f) into display-PDF
  // space (CropBox/rotation). Identity transform => (bounds.x, matrix.f), so
  // `left`/`baselineScreen` below reduce to the exact prior arithmetic.
  const anchor = transform.apply(run.bounds.x, run.matrix.f);
  const left = anchor.x * scale;

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
  const baselineScreen = (pageHeight - anchor.y) * scale;
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
  // Wrap-mode lock width. Lock to the CSS width the run's ORIGINAL text
  // needs - NOT the PDF bounds width. The CSS fallback font is wider than
  // the embedded PDF font, so locking to the (narrower) PDF width instantly
  // wraps the existing line the moment the box is focused, and the text
  // appears to jump ("teleport"). Measuring the original text in the SAME
  // CSS font the box renders with guarantees the existing content stays on
  // its line; only text the user adds beyond it wraps onto new lines. The
  // small pad absorbs sub-pixel rounding between canvas and layout metrics.
  // Lock to the ORIGINAL box: the wider of the run's original bounds width
  // and the CSS width its original text needs. Both are captured on first
  // render, so neither grows as the user types. Using the LIVE `pdfWidth`
  // here would be wrong - committing one-line text grows `run.bounds.width`
  // to fit it, so the box (and the wrap point) would widen with every
  // keystroke and only the final word would ever wrap.
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
  // A multi-line paragraph always WRAPS (never grows off to the right) - it
  // is body text, not a single-line label. "grow" only applies to genuine
  // single-line runs. Without this, focusing a paragraph and typing made
  // the box widen to the (double-spaced, CSS-font) widest line, which blew
  // out past the page edge and clipped text the user never touched.
  const wantWrap = wrapMode || isParagraph;
  // Never let the box extend past the page's right edge. The available width
  // from this run's left edge to the page margin caps every mode, so the
  // editing box always stays on-page and the content wraps to fit.
  const maxOnPageWidth = Math.max(fontSizePx * 4, pageWidth * scale - left - 4);
  const naturalWidth = wantWrap
    ? wrapLockWidth
    : Math.max(pdfWidth, measuredWidth + fontSizePx);
  const width = Math.min(naturalWidth, maxOnPageWidth);
  // `min-height` (not a fixed height) is used below, so the box grows
  // DOWNWARD when content needs it. Wrap whenever wrapping is wanted OR the
  // box had to be capped to the page (so the clipped content reflows).
  const whiteSpace: "pre" | "pre-wrap" =
    wantWrap || width < naturalWidth - 0.5 ? "pre-wrap" : "pre";

  return (
    <div
      ref={ref}
      data-testid={`v2-run-${run.id}`}
      contentEditable={!run.locked}
      suppressContentEditableWarning
      spellCheck={false}
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
        // Paste as PLAIN TEXT. Rich HTML (coloured spans, images) renders
        // in the contentEditable but can never survive into the PDF - the
        // overlay would lie about what gets saved.
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain");
        if (text) document.execCommand("insertText", false, text);
      }}
      onPointerDown={(e) => {
        // Ctrl+Shift+drag is the marquee multi-select gesture. Bail BEFORE
        // stopPropagation so the stage's MarqueeSelector receives it -
        // claiming it here silently MOVED the run instead.
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
        e.stopPropagation();
        // Locked runs are inert: no select, no drag, no edit. They
        // remain visible (the PDFium bitmap renders the source glyphs)
        // and hit-test-able only as a no-op blocker so the user can
        // tell something is there - but no command fires.
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
            // Screen delta -> display-PDF delta (y inverted), then invert the
            // linear part of the CropBox/rotation transform to a raw-PDF delta
            // (the model is raw). Identity transform => (dx, dy) unchanged.
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
        // Shift-click EXTENDS the multi-object selection. Focusing the run
        // (a text-edit action) fights multi-select and lets the browser
        // start a cross-run text-range drag, so the 2nd run often failed to
        // add and the align/distribute buttons stayed disabled. For a
        // shift-click, preventDefault + select-only makes the toggle into
        // selection.runIds authoritative; only a plain click focuses to edit.
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
      onBlur={(e) => {
        setFocused(false);
        // Wrap mode: when the just-edited content overflows the locked box
        // width, persist the wrap by REPOSITIONING the run's existing glyph
        // objects onto new lines (ReflowWrapCommand) - never by re-setting
        // text, which garbles embedded fonts. Only fires when the user
        // actually changed the box and a line now exceeds the box width.
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
        // Runs that were paragraphs on mount always re-flow when edited (an
        // edit re-emits a line at PDF metrics that can overflow the page even
        // when the CSS measure says it fits). Other runs (a heading that just
        // gained a manual break, or a single-line wrap run) re-flow only when
        // they actually overflow the box - so their spacing is left intact.
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
      onInput={(e) => {
        // Skip intermediate IME steps; compositionend commits the result.
        if (composingRef.current || (e.nativeEvent as InputEvent).isComposing)
          return;
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
        // No per-keystroke reflow: while focused, the box is CAPPED to the
        // page and wraps via CSS, so the editing view is always on-page (any
        // underlying glyphs that grew past the page sit off the page canvas
        // and aren't visible). The reflow that bakes the real wrapped layout
        // runs once on blur - keeping the undo history one step per edit.
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
        // Only the opacity settle is animated. The transform must NOT be
        // transitioned: on drop, `dragOffset` resets to null in the same
        // commit that `left`/`top` jump to the committed position, so a
        // transform transition would animate the box from double-offset
        // back to the drop point - it "flew in from the edge". Resetting
        // transform instantly keeps the drop crisp.
        transition: dragging ? "none" : "opacity 120ms ease-out",
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
