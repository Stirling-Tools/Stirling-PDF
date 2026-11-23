import { scanFaceCssFamily } from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  RENDER_MODE_INVISIBLE,
  type TextRange,
  type TextRunSnapshot,
  type WidthMode,
} from "@editor/tools/pdfTextEditor/types";
import { toCssHex } from "@editor/tools/pdfTextEditor/model/Color";
import type { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import {
  resolveLang,
  useSpellcheckPreference,
} from "@editor/tools/pdfTextEditor/util/spellcheck";
import { embeddedFaceFamily } from "@editor/tools/pdfTextEditor/util/embeddedFace";
import { useFontEpoch } from "@editor/tools/pdfTextEditor/hooks/useFontEpoch";
import {
  isDeviceFontId,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  fitTextToWidth,
  NO_FIT,
} from "@editor/tools/pdfTextEditor/util/fitText";
import {
  sampleRunBackground,
  toOpaqueCss,
} from "@editor/tools/pdfTextEditor/util/canvasBackground";
import { buildExactLines } from "@editor/tools/pdfTextEditor/util/exactLayout";
import { stackLineBoxes } from "@editor/tools/pdfTextEditor/util/lineLayout";
import {
  isLinePainted,
  normalizeContainerCaret,
  type PaintLine,
  paintLines,
  FIND_MATCH_HIGHLIGHT,
  canHighlightTextRanges,
  highlightTextRange,
  paintPlainText,
  plainCaretOffset,
  plainDomRange,
  plainSelectionRange,
  readOverlayText,
  refitEditedTokens,
  refitTokens,
  repaintKeepingSelection,
  restoreCaretOffset,
} from "@editor/tools/pdfTextEditor/util/overlayPainter";
import { offsetAcrossRewrap } from "@editor/tools/pdfTextEditor/util/wrapCaret";
import {
  cssFontShorthand,
  measureAdvancePx,
  measureFontMetrics,
  measureLongestTokenWidth,
  measureMaxLineWidth,
} from "@editor/tools/pdfTextEditor/util/textMetrics";
import {
  lineWidthPx,
  type MeasuredText,
  mergeAdvances,
  unpricedChars,
} from "@editor/tools/pdfTextEditor/util/typedAdvances";
import { MIN_WRAP_WIDTH_EM } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { serverFontCssFamily } from "@editor/tools/pdfTextEditor/util/serverFonts";
import type { GrowEdge } from "@editor/tools/pdfTextEditor/util/growEdge";
import "@editor/tools/pdfTextEditor/components/TextRunOverlay.css";

const SETTLE_MS = 400;

const STALL_MS = 250;

/** Must stay in sync with `.pdf-editor-run` padding in TextRunOverlay.css. */
const BOX_PADDING_PX = 2;

// Un-measured keystrokes a run absorbs before the overlay takes over the
// glyphs. One or two are re-rendered fast enough to leave the page's own ink
// alone; a burst is not.
const GUESSED_EDITS_BEFORE_MASK = 2;

// Map a font id like "base14:Helvetica-Bold" or "pdf:1234:Arial" to a CSS
// font-family stack that visually approximates the PDFium-rendered glyphs.
function cssFontFamilyFor(fontId: string): string {
  const idx = fontId.lastIndexOf(":");
  const family = idx >= 0 ? fontId.slice(idx + 1) : fontId;
  // The document's own face, when PDFium gave us bytes a FontFace accepts.
  // An unresolved name costs nothing: the browser moves on to the next entry.
  const own = ownFaceFor(fontId);
  // An edit that outgrew a subset now re-emits in an installed or server face
  // (`device:Calibri`), so the page really is Calibri. Naming it first keeps
  // the overlay measuring and drawing what the page renders; without it
  // nearestStandardFont collapses it to Helvetica and every advance the
  // overlay predicts is a different font's.
  if (isDeviceFontId(fontId)) {
    const server = serverFontCssFamily(family);
    const served = server ? `"${server}", ` : "";
    return `${served}"${family}", ${own}"Liberation Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  }
  const standard = nearestStandardFont(family);
  if (standard.startsWith("Times")) {
    return `${own}"Liberation Serif", "Times New Roman", Times, serif`;
  }
  if (standard.startsWith("Courier")) {
    return `${own}"Liberation Mono", "Courier New", Courier, monospace`;
  }
  return `${own}"Liberation Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;
}

/** `"pdfface-N", ` for a `pdf:<ptr>:<family>` id, else the empty string. */
function ownFaceFor(fontId: string): string {
  const m = /^pdf:(\d+):/.exec(fontId);
  return m ? `"${embeddedFaceFamily(Number(m[1]))}", ` : "";
}

function cssWeightFor(fontId: string): number {
  return /bold/i.test(fontId) ? 700 : 400;
}

function cssStyleFor(fontId: string): "italic" | "normal" {
  return /italic|oblique/i.test(fontId) ? "italic" : "normal";
}

// Read the page bitmap under a run and return an opaque CSS colour for the
// editing mask. Null when the canvas is unreadable, so callers keep a default.
function readMaskColor(el: HTMLDivElement): string | null {
  const page = el.closest("[data-testid^='pdf-editor-page-']");
  const canvas = page?.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return null;
  const cb = canvas.getBoundingClientRect();
  if (cb.width < 1 || cb.height < 1) return null;
  const rb = el.getBoundingClientRect();
  // CSS px -> canvas px: the bitmap is rendered at its own device scale.
  const sx = canvas.width / cb.width;
  const sy = canvas.height / cb.height;
  const rgb = sampleRunBackground(canvas, {
    x: (rb.left - cb.left) * sx,
    y: (rb.top - cb.top) * sy,
    width: rb.width * sx,
    height: rb.height * sy,
  });
  return rgb ? toOpaqueCss(rgb) : null;
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

// Put the caret at the end of the LAST painted line block rather than at the
// container's end. A container-level caret makes Firefox insert typed text as
// a bare sibling of the line div, which then reads back as an extra line.
function caretToEnd(el: HTMLElement, sel: Selection): void {
  let node: Node = el;
  while (node.lastChild) node = node.lastChild;
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, (node.textContent ?? "").length);
    range.collapse(true);
  } else if (node !== el && node.parentNode) {
    // Trailing filler <br>: sit just before it, still inside its block.
    range.setStartBefore(node);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

interface ExactLayout {
  lines: PaintLine[];
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  signature: string;
}

function computeExactLayout(args: {
  run: TextRunSnapshot;
  transform: DisplayTransform;
  pageHeight: number;
  scale: number;
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  ascent: number;
  descent: number;
}): ExactLayout | null {
  const { run, transform, pageHeight, scale } = args;
  if (!run.charStartsX || !run.charEndsX) return null;
  const exact = buildExactLines(run.text, {
    starts: run.charStartsX,
    ends: run.charEndsX,
  });
  if (!exact || exact.length === 0) return null;

  // Slot lefts are indexed by line, so an edit that added or removed a line
  // makes every entry below it describe a different line - the same length
  // guard the baselines already get.
  const slotLefts =
    run.paragraphLineLefts?.length === exact.length
      ? run.paragraphLineLefts
      : undefined;
  const lineLefts = exact.map((line, i) => {
    const fromSlot = slotLefts?.[i];
    if (fromSlot !== undefined && Number.isFinite(fromSlot)) return fromSlot;
    if (Number.isFinite(line.left)) return line.left;
    return i === 0 ? run.matrix.e : run.bounds.x;
  });

  const baselines = baselinesFor(run, exact.length);
  if (!baselines) return null;

  const anchors = baselines.map((y, i) => transform.apply(lineLefts[i], y));
  const leftsPx = anchors.map((a) => a.x * scale);
  const baselineTopsPx = anchors.map((a) => (pageHeight - a.y) * scale);

  const halfLeading = Math.max(
    0,
    (args.lineHeightPx - (args.ascent + args.descent)) / 2,
  );
  const stack = stackLineBoxes(
    baselineTopsPx,
    args.lineHeightPx,
    halfLeading + args.ascent,
  );
  if (!stack) return null;

  const leftPx = Math.min(...leftsPx);
  if (!Number.isFinite(leftPx) || !Number.isFinite(stack.topPx)) return null;

  const lines: PaintLine[] = exact.map((line, i) => ({
    tokens: line.tokens.map((t) => ({
      text: t.text,
      advancePx: t.width * scale,
    })),
    heightPx: args.lineHeightPx,
    marginTopPx: stack.marginTopsPx[i],
    marginLeftPx: leftsPx[i] - leftPx,
  }));

  const widthPx = Math.max(
    run.bounds.width * scale,
    ...lines.map(
      (l) => l.marginLeftPx + l.tokens.reduce((sum, t) => sum + t.advancePx, 0),
    ),
  );
  const heightPx =
    lines.reduce((sum, l) => sum + l.marginTopPx + l.heightPx, 0) +
    args.descent;
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null;
  const signature = [
    args.font,
    leftPx.toFixed(2),
    stack.topPx.toFixed(2),
    ...lines.map((l) =>
      [
        l.marginTopPx.toFixed(2),
        l.marginLeftPx.toFixed(2),
        l.tokens.length,
        l.tokens.reduce((sum, t) => sum + t.advancePx, 0).toFixed(2),
      ].join(","),
    ),
  ].join("|");
  return { lines, leftPx, topPx: stack.topPx, widthPx, heightPx, signature };
}

function measuredTextOf(run: TextRunSnapshot): MeasuredText | null {
  const { charStartsX: starts, charEndsX: ends } = run;
  if (!starts || !ends || starts.length !== run.text.length) return null;
  return { text: run.text, starts, ends };
}

// PDF advance per em for every character the run already carries. Scale-free,
// so it stays valid as the user zooms. Each character is priced from its last
// occurrence: the engine can draw typed letters at other advances than the
// document's own, and the letters typed last are the ones the next keystroke
// repeats.
function charAdvancesEm(run: TextRunSnapshot): Map<string, number> | null {
  const starts = run.charStartsX;
  const ends = run.charEndsX;
  if (!starts || !ends || starts.length !== run.text.length) return null;
  if (!(run.fontSize > 0)) return null;
  const map = new Map<string, number>();
  const price = (ch: string, widthPt: number) => {
    if (Number.isFinite(widthPt) && widthPt > 0)
      map.set(ch, widthPt / run.fontSize);
  };
  const placed = (i: number) =>
    Number.isFinite(starts[i]) && Number.isFinite(ends[i]);
  // A glyph's box is its ink, not its advance: neighbours overlap it. The pen
  // moves from one glyph's start to the next one's.
  for (let i = 0; i + 1 < run.text.length; i += 1) {
    if (run.text[i + 1] === "\n" || !placed(i) || !placed(i + 1)) continue;
    price(run.text[i], starts[i + 1] - starts[i]);
  }
  // A space the PDF draws by advancing the pen has no box of its own, so it
  // takes what is left of the step between the glyphs either side of it.
  for (let i = 0; i < run.text.length; i += 1) {
    if (!placed(i) || run.text[i] === "\n") continue;
    let j = i + 1;
    while (j < run.text.length && run.text[j] !== "\n" && !placed(j)) j += 1;
    const gap = j - i - 1;
    const own = map.get(run.text[i]);
    if (gap === 0 || j >= run.text.length || run.text[j] === "\n") {
      if (own === undefined) price(run.text[i], ends[i] - starts[i]);
      continue;
    }
    if (own === undefined) continue;
    const each = (starts[j] - starts[i] - own * run.fontSize) / gap;
    for (let k = i + 1; k < j; k += 1) price(run.text[k], each);
  }
  return map.size > 0 ? map : null;
}

function baselinesFor(
  run: TextRunSnapshot,
  lineCount: number,
): number[] | null {
  const stored = run.paragraphBaselines;
  if (stored && stored.length === lineCount && stored.every(Number.isFinite)) {
    return stored;
  }
  if (lineCount === 1) return [run.matrix.f];
  const step =
    run.paragraphLineHeight && run.paragraphLineHeight > 0
      ? run.paragraphLineHeight
      : run.fontSize * 1.2;
  const out: number[] = [];
  for (let i = 0; i < lineCount; i += 1) out.push(run.matrix.f - i * step);
  return out;
}

interface TextRunOverlayProps {
  run: TextRunSnapshot;
  pageHeight: number;
  /** Page width in PDF points - caps the box so it never runs off-page. */
  pageWidth: number;
  /** Raw-PDF -> display (CropBox/rotation) transform. */
  transform: DisplayTransform;
  scale: number;
  /** "grow": box widens to the right up to the page edge, then wraps. "wrap": locked width, wraps down. */
  widthMode: WidthMode;
  /** Other text set beside the run on its rows, which Grow wraps short of as it does the page edge. */
  growEdge?: GrowEdge | null;
  selected: boolean;
  /** The find-bar occurrence inside this run, painted as a highlight. */
  findRange?: TextRange | null;
  pageRevision?: number;
  onSelect: (shiftKey: boolean) => void;
  onEdit: (nextText: string) => void;
  /** Fires when the user Ctrl+drags the run to a new position. dx/dy are PDF points. */
  onMove?: (dx: number, dy: number) => void;
  /**
   * Fires when typed text overflows the box: past the locked width in Wrap,
   * past the page edge in Grow, which asks to keep clear of what lies below.
   * Runs synchronously and returns the run's text after the wrap, or null when
   * the wrap was refused.
   */
  onWrap?: (
    maxWidthPt: number,
    keepClearBelow?: boolean,
  ) => string | null | void;
  /**
   * The run with the engine's pen positions for its current text, read
   * synchronously. Costs a re-read of the page, so the box calls it only for
   * a letter it has no PDF advance for, for a line that looks to cross the
   * edge, and once a wrap has moved the lines.
   */
  onMeasure?: () => TextRunSnapshot | null;
  /** Fires when the user drags the right edge to a new width, in PDF points. */
  onResize?: (widthPt: number) => void;
  /** Fires while the box has focus, as the characters selected inside it change. */
  onTextRangeChange?: (range: TextRange | null) => void;
  /** The characters selected inside the box, highlighted while it has no focus. */
  textRange?: TextRange | null;
  /**
   * Where the move/width grips render: a layer in the same positioned parent
   * as the box, painted beneath every run. Without it the box has no grips.
   */
  gripLayer?: HTMLElement | null;
}

/**
 * Which grip the pointer is over: the right edge re-wraps the run to a new
 * width; the rest of the frame moves it.
 */
type EdgeZone = "move" | "resize";

/** How far the grip bands reach outside the box, and into it, in CSS px. */
const GRIP_OUT_PX = 5;
const GRIP_IN_PX = 1;

const GRIP_BANDS: ReadonlyArray<{
  side: "top" | "bottom" | "left" | "right";
  style: CSSProperties;
}> = [
  {
    side: "top",
    style: {
      left: -GRIP_OUT_PX,
      right: -GRIP_OUT_PX,
      top: -GRIP_OUT_PX,
      height: GRIP_OUT_PX + GRIP_IN_PX,
    },
  },
  {
    side: "bottom",
    style: {
      left: -GRIP_OUT_PX,
      right: -GRIP_OUT_PX,
      bottom: -GRIP_OUT_PX,
      height: GRIP_OUT_PX + GRIP_IN_PX,
    },
  },
  {
    side: "left",
    style: {
      left: -GRIP_OUT_PX,
      top: 0,
      bottom: 0,
      width: GRIP_OUT_PX + GRIP_IN_PX,
    },
  },
  {
    side: "right",
    style: {
      right: -GRIP_OUT_PX,
      top: 0,
      bottom: 0,
      width: GRIP_OUT_PX + GRIP_IN_PX,
    },
  },
];

/**
 * The caret for a click inside the box but above its first line or below its
 * last, where the browser would otherwise put it at the end of the text.
 */
function caretBesideLines(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): Range | null {
  const text = document.createRange();
  text.selectNodeContents(el);
  const r = text.getBoundingClientRect();
  if (r.height <= 2 || (clientY >= r.top && clientY <= r.bottom)) return null;
  const boxes = Array.from(text.getClientRects()).filter((b) => b.height > 2);
  const line =
    boxes.length === 0
      ? r
      : clientY < r.top
        ? boxes.reduce((a, b) => (b.top < a.top ? b : a))
        : boxes.reduce((a, b) => (b.bottom > a.bottom ? b : a));
  // The middle of the nearest line: near the edge of its line box WebKit's
  // hit test misses the glyphs and returns the end of the text.
  const y = (line.top + line.bottom) / 2;
  const position = document.caretPositionFromPoint?.(clientX, y);
  const caret = position
    ? document.createRange()
    : (document.caretRangeFromPoint?.(clientX, y) ?? null);
  if (position && caret) caret.setStart(position.offsetNode, position.offset);
  if (!caret || !el.contains(caret.startContainer)) return null;
  caret.collapse(true);
  return caret;
}

/** The line of `text` holding character offset `offset`, and its index. */
function lineAt(text: string, offset: number): { index: number; text: string } {
  const lines = text.split("\n");
  let start = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const end = start + lines[index].length;
    if (offset <= end) return { index, text: lines[index] };
    start = end + 1;
  }
  return { index: lines.length - 1, text: lines[lines.length - 1] };
}

/** Where the collapsed caret inside `el` is drawn, or null without one. */
function caretClientX(el: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !el.contains(selection.focusNode)) return null;
  const caret = selection.getRangeAt(0).cloneRange();
  caret.collapse(false);
  const rects = caret.getClientRects();
  const rect = rects.length > 0 ? rects[0] : caret.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 && rect.x === 0 ? null : rect.x;
}

// The room `edge` leaves a box whose left sits at `leftPx`, in CSS px. A turned page lays the page's x along the screen's y, where Grow does not reach.
function growEdgeRoomPx(
  edge: GrowEdge | null | undefined,
  run: TextRunSnapshot,
  transform: DisplayTransform,
  scale: number,
  leftPx: number,
): number {
  if (!edge || transform.rotate !== 0) return Number.POSITIVE_INFINITY;
  const edgePx = transform.apply(edge.x, run.matrix.f).x * scale;
  if (edge.side === "right") return edgePx - leftPx;
  const end = run.bounds.x + run.bounds.width;
  return transform.apply(end, run.matrix.f).x * scale - edgePx;
}

/** One editable HTML element per PDF text run. */
export function TextRunOverlay({
  run,
  pageHeight,
  pageWidth,
  transform,
  scale,
  widthMode,
  growEdge,
  selected,
  findRange,
  pageRevision,
  onSelect,
  onEdit,
  onMove,
  onWrap,
  onMeasure,
  onResize,
  onTextRangeChange,
  textRange,
  gripLayer,
}: TextRunOverlayProps) {
  const { t } = useTranslation();
  // Subscribed, so toggling the preference re-renders every overlay.
  const spellcheck = useSpellcheckPreference();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Only while focused: blurring clears the browser's selection, and the
  // range must outlive that for the inspector to act on it.
  useEffect(() => {
    if (!focused || !onTextRangeChange) return;
    const report = () => {
      const el = ref.current;
      const selection = window.getSelection();
      if (!el || !selection?.focusNode || !el.contains(selection.focusNode)) {
        return;
      }
      onTextRangeChange(plainSelectionRange(el));
    };
    document.addEventListener("selectionchange", report);
    return () => document.removeEventListener("selectionchange", report);
  }, [focused, onTextRangeChange]);
  // Masking a run the user has only clicked into swaps real PDF ink for a
  // CSS approximation, so hold the pristine bitmap until an actual edit.
  const [touched, setTouchedState] = useState(false);
  // Live copy for effects: a commit's effect can run after a newer keystroke.
  const touchedRef = useRef(false);
  const setTouched = (next: boolean) => {
    touchedRef.current = next;
    setTouchedState(next);
  };
  const [editTick, setEditTick] = useState(0);
  const [stalled, setStalled] = useState(false);
  const editedAtRevisionRef = useRef(-1);
  // Keystrokes taken since the engine last measured this run, and when the
  // overlay's glyphs first came due because of them.
  const guessedEditsRef = useRef(0);
  const maskDueSinceRef = useRef(0);
  const paintedSignatureRef = useRef<string | null>(null);
  const pointerFocusRef = useRef(false);
  // The mask has to be the page's own colour, not a guess from the text: a
  // run on a coloured page got a grey band. Sampled from the rendered bitmap
  // once per focus, so the read never lands in the typing path.
  const [maskColor, setMaskColor] = useState<string | null>(null);
  const faceEpoch = useFontEpoch();
  // True between compositionstart and compositionend (IME). While composing
  // onInput must not dispatch per-keystroke edits; we commit once on end.
  const composingRef = useRef(false);
  // Text content captured when the box gains focus, so blur can tell whether
  // the user actually edited it (and a Wrap reflow is warranted).
  const focusTextRef = useRef<string>("");
  // Drag-to-move state. `dragOffset` is the live cursor delta applied as a
  // CSS transform so the box follows the cursor during the drag.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [gripZone, setGripZone] = useState<EdgeZone | null>(null);
  const gripsRef = useRef<HTMLDivElement | null>(null);
  // The grips frame is a sibling, so it is sized from the box's rendered
  // border box: the box grows with its text past the height it is given.
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setBoxSize({ w: el.offsetWidth, h: el.offsetHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Live box width while the right edge is being dragged, in CSS px.
  const [resizeWidthPx, setResizeWidthPx] = useState<number | null>(null);
  // Detaches an in-flight resize's window listeners, so a cancelled or
  // unmounted resize can never commit a width on a later pointerup.
  const endResizeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endResizeRef.current?.(), []);
  const originalBoundsWidthRef = useRef<number>(run.bounds.width);
  // The widest line when focus arrived: Grow wraps only what is typed past the page edge, never a line the document already set wider.
  const focusWidestRef = useRef(0);
  // Set when a Grow wrap was refused for want of room below: the box then grows past the page edge for the rest of this edit rather than draw over what is there.
  const [growBlocked, setGrowBlocked] = useState(false);
  // Content width the typed text needs beyond the laid-out box, in CSS px,
  // until the next wrap or focus change.
  const [fitWidthPx, setFitWidthPx] = useState<number | null>(null);
  const unwrappedLineRef = useRef<{ index: number; width: number } | null>(
    null,
  );
  // Whether this run was a real (multi-line) paragraph when it first mounted.

  const faceName = run.scanFamily ?? run.fontId;
  // The caret is placed by letter widths, so scanned text uses the matched face, not the invisible OCR layer's font.
  const fontFamily = run.scanFamily
    ? scanFaceCssFamily(run.scanFamily)
    : cssFontFamilyFor(run.fontId);
  const fontWeight = cssWeightFor(faceName);
  const fontStyle = cssStyleFor(faceName);
  const fontSizePx = Math.max(4, run.fontSize * scale);
  const font = cssFontShorthand(fontStyle, fontWeight, fontSizePx, fontFamily);
  const { ascent, descent } = useMemo(
    () => measureFontMetrics(font, fontSizePx),
    [font, fontSizePx, faceEpoch],
  );

  const lineHeightPx =
    run.paragraphLineHeight && run.paragraphLineHeight > 0
      ? run.paragraphLineHeight * scale
      : fontSizePx * 1.2;

  const freshExact = useMemo(
    () =>
      computeExactLayout({
        run,
        transform,
        pageHeight,
        scale,
        font,
        fontSizePx,
        lineHeightPx,
        ascent,
        descent,
      }),
    [
      run,
      transform,
      pageHeight,
      scale,
      font,
      fontSizePx,
      lineHeightPx,
      ascent,
      descent,
    ],
  );

  // How the run's own text axis is rotated on the page, if it is. cos/sin come
  // straight from the text matrix; screen y runs the other way from PDF y, so
  // the CSS angle is the negation.
  const runRotation = useMemo(() => {
    const norm = Math.hypot(run.matrix.a, run.matrix.b);
    // The run's own slant, if any. Screen y runs opposite to PDF y, so the CSS
    // angle is the negation of the matrix angle.
    const own = norm
      ? -Math.atan2(run.matrix.b / norm, run.matrix.a / norm) * (180 / Math.PI)
      : 0;
    // Plus the page's own quarter-turns. `transform.apply` already puts the
    // anchor in the right place on a /Rotate page, but the box was still drawn
    // along the PAGE's x-axis while the glyphs ran down it, so a box on a
    // /Rotate 90 page stuck up to 247px off the right-hand edge.
    const pageDeg = ((((transform.rotate ?? 0) % 4) + 4) % 4) * 90;
    const deg = own + pageDeg;
    if (Math.abs(deg) < 0.01) return null;
    return { deg };
  }, [run.matrix.a, run.matrix.b, transform.rotate]);

  const heldExactRef = useRef<ExactLayout | null>(null);
  if (freshExact) heldExactRef.current = freshExact;
  // An exact layout is built from per-character x positions along the PAGE's
  // x-axis, which stop describing a run whose own axis is rotated - the box
  // came out axis-aligned over slanted glyphs and covered 38% of its own ink.
  // Rotated runs use the flow geometry plus a matching CSS rotation instead.
  const exact = runRotation
    ? null
    : (freshExact ?? (focused ? heldExactRef.current : null));
  if (!freshExact && !focused) heldExactRef.current = null;

  const advanceEm = useMemo(() => charAdvancesEm(run), [run]);
  // Kept across the edit: the engine drops the pen positions the moment the
  // text changes, and a token typed into needs them most right then. Letters
  // learned from a measure mid-burst stay until the face changes.
  const heldAdvanceEmRef = useRef<Map<string, number> | null>(null);
  const heldAdvanceFaceRef = useRef("");
  const advanceFace = `${run.fontId}\u0000${run.fontSize}`;
  if (heldAdvanceFaceRef.current !== advanceFace) {
    heldAdvanceFaceRef.current = advanceFace;
    heldAdvanceEmRef.current = null;
  }
  if (advanceEm)
    heldAdvanceEmRef.current = mergeAdvances(
      heldAdvanceEmRef.current,
      advanceEm,
    );
  // Letters a measure could not price, such as a mark with no advance of its
  // own, so a burst does not re-read the page for them on every keystroke.
  const unpriceableRef = useRef(new Set<string>());
  // The latest text the engine gave pen positions for, from the run or from a
  // measure taken mid-keystroke, whichever is newer.
  const measuredRef = useRef<MeasuredText | null>(null);
  const runMeasured = measuredTextOf(run);
  if (runMeasured) measuredRef.current = runMeasured;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBeforeInput = (event: Event) => {
      const inputType = (event as InputEvent).inputType ?? "";
      if (inputType.startsWith("format")) event.preventDefault();
      // The browser keeps its OWN undo stack for a contenteditable, reachable
      // from the Edit menu and trackpad gestures. Letting it fire would rewrite
      // the overlay behind the editor's command history, so the two disagree
      // about the document. Undo/redo has to come through the command stack.
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        event.preventDefault();
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  useEffect(() => {
    if (!touched) return;
    if (pageRevision === undefined) return;
    if (pageRevision <= editedAtRevisionRef.current) return;
    const timer = window.setTimeout(() => setTouched(false), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [pageRevision, touched, editTick]);

  // No exact layout for the text now in the box: the engine only re-measures
  // pen positions once typing pauses, so until it does the overlay is placing
  // glyphs on the browser's advances rather than the PDF's.
  const layoutIsGuessed = touched && !freshExact;

  const paintOpts = {
    font,
    fontSizePx,
    advanceEm: heldAdvanceEmRef.current,
  };
  const livePaintOpts = () => ({
    ...paintOpts,
    advanceEm: heldAdvanceEmRef.current,
  });
  const lineWidth = (text: string, lineIndex: number) =>
    lineWidthPx(
      text,
      lineIndex,
      measuredRef.current,
      heldAdvanceEmRef.current,
      fontSizePx,
      scale,
      (ch) => measureAdvancePx(ch, font),
    );

  useEffect(() => {
    if (!layoutIsGuessed) {
      guessedEditsRef.current = 0;
      maskDueSinceRef.current = 0;
      setStalled(false);
      return;
    }
    guessedEditsRef.current += 1;
    // The mask replaces the page's own ink with a CSS approximation of it, so
    // arming it mid-word visibly changes the typeface of text the user is
    // typing into - and changes it back when the engine catches up. That is a
    // worse artefact than the caret leading the page render, which is all it
    // buys: the raster is simply slower than a fast burst, and it self-corrects
    // the moment typing pauses. So it stays reserved for a run that has fallen
    // BEHIND ITS OWN PAGE RENDER - not for one whose page is merely mid-flight.
    if (
      pageRevision !== undefined &&
      pageRevision > editedAtRevisionRef.current
    ) {
      setStalled(false);
      return;
    }
    if (guessedEditsRef.current < GUESSED_EDITS_BEFORE_MASK) return;
    // The deadline is anchored where the mask first came due, so typing on does
    // not keep pushing it out of reach.
    const now = Date.now();
    if (maskDueSinceRef.current === 0) maskDueSinceRef.current = now;
    const wait = Math.max(0, STALL_MS - (now - maskDueSinceRef.current));
    const timer = window.setTimeout(() => setStalled(true), wait);
    return () => window.clearTimeout(timer);
  }, [layoutIsGuessed, pageRevision, editTick]);

  useEffect(() => {
    const el = ref.current;
    if (!el || composingRef.current) return;
    if (!isLinePainted(el)) return;
    refitTokens(el, paintOpts);
  }, [font, fontSizePx]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement === el;
    // Focus may sit on a descendant mid-edit; either way the run owns the caret
    // and is entitled to re-seat it. A blurred run is not.
    const ownsFocus = el.contains(document.activeElement);
    if (active && composingRef.current) return;
    const domText = readOverlayText(el);
    // Mid-edit, the only layout allowed to repaint is one the engine has
    // already measured for exactly this text. It re-seats the typed glyphs on
    // the PDF's own advances - without it the overlay keeps laying them out at
    // the browser's, and the caret walks off the text on the page a fraction of
    // a pixel per keystroke. Any other layout would be fighting a keystroke
    // still in flight.
    // Read live: an effect committed before a keystroke still sees the old
    // `touched` and would paint the pre-edit text over the new character.
    if (active && touchedRef.current && !(freshExact && domText === run.text))
      return;
    const wantSignature = freshExact ? freshExact.signature : "";
    if (!freshExact && isLinePainted(el) && domText === run.text) return;
    if (
      domText === run.text &&
      paintedSignatureRef.current === wantSignature &&
      isLinePainted(el) === !!freshExact
    ) {
      return;
    }
    // Keyed off the selection, not the focus: replaceChildren below detaches
    // whatever node the caret sits in, and a caret this run holds without being
    // document.activeElement is still a caret the next insert needs.
    // Only while the run still holds focus. A selection outlives the blur that
    // ended the edit, so re-seating it into a blurred run takes focus BACK -
    // and the user's next click elsewhere then fires this run's blur handler,
    // dispatching a spurious wrap that also wipes the redo stack.
    repaintKeepingSelection(el, ownsFocus, () => {
      if (freshExact) paintLines(el, freshExact.lines, paintOpts);
      else paintPlainText(el, run.text);
    });
    paintedSignatureRef.current = wantSignature;
  }, [run.text, freshExact, font, fontSizePx, touched, faceEpoch]);

  // After the paint above, which replaces the nodes a range would hold. The
  // browser's own selection goes with the focus, as when the inspector is
  // used, so the stored range is painted in its place.
  useEffect(() => {
    const el = ref.current;
    if (focused || !textRange || !el) return;
    const range = plainDomRange(el, textRange);
    return range ? highlightTextRange(range) : undefined;
  }, [focused, textRange, run.text, freshExact, font, fontSizePx, faceEpoch]);

  useEffect(() => {
    const el = ref.current;
    if (!findRange || !el) return;
    const range = plainDomRange(el, findRange);
    return range ? highlightTextRange(range, FIND_MATCH_HIGHLIGHT) : undefined;
  }, [findRange, run.text, freshExact, font, fontSizePx, faceEpoch]);

  const anchor = transform.apply(run.matrix.e, run.matrix.f);
  const flowLeft = anchor.x * scale;

  const invisible = run.renderMode === RENDER_MODE_INVISIBLE;
  const showsGlyphs = (dragging || stalled) && !invisible;

  const singleLine = (run.paragraphLineCount ?? 1) <= 1;
  const fit =
    !exact && showsGlyphs && singleLine
      ? fitTextToWidth(
          run.text,
          measureMaxLineWidth(run.text, font),
          run.bounds.width * scale,
          fontSizePx,
        )
      : NO_FIT;

  // VERTICAL PLACEMENT - anchor the first line's CSS alphabetic baseline
  // exactly onto the PDF baseline (`run.matrix.f`).
  const halfLeading = Math.max(0, (lineHeightPx - (ascent + descent)) / 2);
  const firstBaselineFromTop = halfLeading + ascent;
  const baselineScreen = (pageHeight - anchor.y) * scale;
  const flowTop = baselineScreen - firstBaselineFromTop;

  // Height covers every line plus descender slack.
  const lineCount = Math.max(1, run.text.split(/\r?\n/).length);
  const flowHeight = lineCount * lineHeightPx + descent;

  const pdfWidth = run.bounds.width * scale;
  // Widen the overlay so every source line still fits in CSS metrics, and so
  // typed text wider than the original bounds isn't clipped.
  const measuredWidth = measureMaxLineWidth(run.text, font);
  // Width behaviour is user-controlled: - "grow": box widens to the right to
  // fit the content.
  const wrapMode = widthMode === "wrap";
  const wrapLockWidth = Math.max(
    (run.wrapWidthPt ?? originalBoundsWidthRef.current) * scale,
    fontSizePx * MIN_WRAP_WIDTH_EM,
  );
  // The mode the user picked, and nothing else: wrapping a paragraph in Grow
  // before it reaches the page edge makes the two modes indistinguishable.
  const wantWrap = wrapMode;
  const left = exact ? exact.leftPx : flowLeft;
  // Both modes keep typed text on the page: Wrap at its locked width, Grow once
  // the box reaches the page edge or the text set beside it, never narrower
  // than the run already is.
  const pageCap = Math.max(fontSizePx * 4, pageWidth * scale - left - 4);
  const growCap = Math.min(
    pageCap,
    Math.max(
      growEdgeRoomPx(growEdge, run, transform, scale, left),
      originalBoundsWidthRef.current * scale,
    ),
  );
  // Wrapping cannot break inside a word, so a box narrower than the longest one
  // hides its tail however the lines are broken - 707px of a held-down key
  // measured invisible, with the caret out there past the box edge.
  //
  // The longest token overrides even the page edge. Stopping there is right for
  // text that can wrap, because the overflow has somewhere else to go; a word
  // with no break in it has nowhere, so the cap stops protecting the page
  // margin and just hides what the user is typing.
  const longestTokenWidth = measureLongestTokenWidth(run.text, font);
  const wrapWidth = Math.max(
    Math.min(wrapLockWidth, pageCap),
    longestTokenWidth + fontSizePx,
  );
  // The reflow lays text out along the page axis, so a turned run keeps growing.
  const growWraps = !wantWrap && !!onWrap && !runRotation && !growBlocked;
  const growWrapWidth = Math.max(growCap, longestTokenWidth + fontSizePx);
  const growOverflowWidth = Math.max(growWrapWidth, focusWidestRef.current);
  const maxOnPageWidth = wantWrap ? pageCap : Number.POSITIVE_INFINITY;
  const naturalWidth = wantWrap
    ? wrapLockWidth
    : Math.max(pdfWidth, measuredWidth + fontSizePx);
  const flowWidth = Math.min(naturalWidth, maxOnPageWidth);

  const top = exact ? exact.topPx : flowTop;
  // Width must not depend on anything that can flip between renders, or the box
  // visibly pumps between two sizes while the user types: caret room kept only
  // while focused, or the measured fallback dropped once `freshExact` arrives,
  // would each flip with the engine's 100ms re-measure. So the slack is always
  // kept and the wider of the two always taken.
  const exactWidth = exact
    ? Math.max(exact.widthPx + fontSizePx * 0.5, measuredWidth + fontSizePx)
    : 0;
  // Grow stops at the page edge or the text beside it, or at the document's
  // own width for a line it set wider than that, focused or not so the box
  // keeps its size across a blur; the live reflow below moves the overflow
  // onto new lines. The box itself never wraps: the PDF draws each line as ONE
  // text object at one pen origin, so an overlay that wrapped by CSS would
  // stop describing the page underneath it.
  const userWidthPx = (run.wrapWidthPt ?? 0) * scale;
  const grownWidth = exact ? exactWidth : flowWidth;
  const laidOutWidth = wantWrap
    ? wrapWidth
    : Math.max(
        growWraps
          ? Math.min(
              grownWidth,
              Math.max(
                growWrapWidth,
                originalBoundsWidthRef.current * scale + fontSizePx,
              ),
            )
          : grownWidth,
        userWidthPx,
      );
  const width =
    fitWidthPx === null ? laidOutWidth : Math.max(laidOutWidth, fitWidthPx);
  const height = exact ? exact.heightPx : flowHeight;
  // An exact layout is never wrapped - its lines are the PDF's own. Only the
  // plain-text fallback, where CSS flow genuinely owns the layout, may wrap.
  const whiteSpace: "pre" | "pre-wrap" =
    !exact && wantWrap ? "pre-wrap" : "pre";

  // Wrap AS THE USER TYPES, on the keystroke that crosses the edge, and paint
  // the wrapped text into the box before the next key can arrive. The reflow
  // turns a space into a line break in the model; a DOM still holding the space
  // hands it back on the next keystroke's edit, so a wrap the box did not
  // mirror at once was undone by every key typed after it. It shares
  // EditTextCommand's coalesce key and ignores the time window, so running it
  // mid-burst does not fragment undo.
  function wrapTypedText(el: HTMLDivElement, text: string): boolean {
    if (!onWrap || !(wantWrap || growWraps)) return false;
    const longest = measureLongestTokenWidth(text, font) + fontSizePx;
    const target = wantWrap
      ? Math.max(Math.min(wrapLockWidth, pageCap), longest)
      : Math.max(growCap, longest);
    const overflowAt = wantWrap
      ? target
      : Math.max(target, focusWidestRef.current);
    // Only the line being typed on: the canvas can measure a line the document
    // set a few points wider than the PDF draws it, and a reflow on every
    // keystroke for a line the PDF says fits costs more the longer the burst.
    const caret = plainCaretOffset(el);
    const line = lineAt(text, caret ?? text.length);
    // A space typed at the edge waits for the letter after it: wrapping on it
    // would leave nothing on the new line for the caret to follow.
    let width = lineWidth(text, line.index);
    if (width <= overflowAt) return false;
    // Priced letters can land a pixel either side of the PDF's, and the reflow
    // judges by the PDF's: asking it on a price alone gets a refusal, and the
    // half-em retry below then breaks the line two keys late.
    if (onMeasure && measuredRef.current?.text !== text) {
      const measured = onMeasure();
      if (measured?.text === text) {
        learnAdvances(measured);
        width = lineWidth(text, line.index);
        if (width <= overflowAt) return false;
      }
    }
    // A line the reflow left as it was is retried once it is half an em wider.
    const unwrapped = unwrappedLineRef.current;
    if (
      unwrapped?.index === line.index &&
      width < unwrapped.width + fontSizePx * 0.5
    ) {
      return false;
    }
    const wrapped = wantWrap
      ? onWrap(target / scale)
      : onWrap(target / scale, true);
    if (wrapped === null) {
      setGrowBlocked(true);
      return false;
    }
    if (typeof wrapped !== "string" || wrapped === text) {
      unwrappedLineRef.current = { index: line.index, width };
      return false;
    }
    unwrappedLineRef.current = null;
    paintMeasured(el, wrapped);
    if (caret !== null)
      restoreCaretOffset(el, offsetAcrossRewrap(text, caret, wrapped));
    setFitWidthPx(null);
    return true;
  }

  // Lays `text` out where the PDF now draws it, read in this keystroke: a
  // later repaint from the debounced re-measure then finds nothing to move.
  // Plain text, laid out on the browser's advances, when it cannot be read.
  function paintMeasured(el: HTMLDivElement, text: string): void {
    const measured = onMeasure?.() ?? null;
    const layout =
      measured && measured.text === text && !runRotation
        ? computeExactLayout({
            run: measured,
            transform,
            pageHeight,
            scale,
            font,
            fontSizePx,
            lineHeightPx,
            ascent,
            descent,
          })
        : null;
    if (measured) learnAdvances(measured);
    if (layout) {
      paintLines(el, layout.lines, livePaintOpts());
      paintedSignatureRef.current = layout.signature;
    } else {
      paintPlainText(el, text);
      paintedSignatureRef.current = "";
    }
  }

  function learnAdvances(measured: TextRunSnapshot): void {
    measuredRef.current = measuredTextOf(measured) ?? measuredRef.current;
    heldAdvanceEmRef.current = mergeAdvances(
      heldAdvanceEmRef.current,
      charAdvancesEm(measured),
    );
  }

  // Prices every letter of `text` from the PDF before the keystroke is laid
  // out, reading the run once for any letter not priced yet: a letter priced
  // on the browser's advance is drawn wider or narrower than the page draws
  // it, and correcting it later moves the caret back under the user.
  function priceTypedLetters(text: string): void {
    if (!onMeasure) return;
    const unpriced = unpricedChars(text, heldAdvanceEmRef.current);
    for (const ch of unpriceableRef.current) unpriced.delete(ch);
    if (unpriced.size === 0) return;
    const measured = onMeasure();
    if (!measured || measured.text !== text) return;
    learnAdvances(measured);
    for (const ch of unpriced)
      if (!heldAdvanceEmRef.current?.has(ch)) unpriceableRef.current.add(ch);
  }

  function commitTypedText(el: HTMLDivElement, raw: string): void {
    const text = raw.replace(/\u00A0/g, " ");
    onEdit(text);
    priceTypedLetters(text);
    // Re-fit the token the user just typed into. Its painted width is the
    // PDF's advance for the ORIGINAL string, so leaving it alone lays the
    // new text out at the browser's own advances and the caret drifts off
    // the glyphs on the page, a pixel or so per keystroke.
    if (isLinePainted(el)) refitEditedTokens(el, livePaintOpts());
    if (!wrapTypedText(el, text)) fitTypedText(el);
  }

  // Widen the box to keep the caret in it when the line it is typing on did
  // not wrap, such as one drawn as a single PDF object with no break to take.
  // The box clips, so without this the text and the caret sit out of sight
  // past its edge. Half an em is left clipped: the browser draws freshly
  // typed letters up to that much wider than the PDF until the engine
  // re-measures them, and the PDF wraps them on the next key.
  function fitTypedText(el: HTMLDivElement): void {
    const caretX = caretClientX(el);
    if (caretX === null) return;
    const box = el.getBoundingClientRect();
    const contentLeft = box.left + BOX_PADDING_PX;
    if (caretX <= box.right - BOX_PADDING_PX + fontSizePx * 0.5) return;
    setFitWidthPx(Math.ceil(caretX - contentLeft) + 1);
  }

  // Which dictionary the browser should load. "auto" falls back to the
  // page's own language, which is what the element would inherit anyway.
  // The reflow lays text out along the page axis, so a turned run has no
  // meaningful width to drag.
  const canResize = !!onResize && !runRotation;
  const minResizePx = fontSizePx * MIN_WRAP_WIDTH_EM;

  function startResize(
    originX: number,
    pointerId: number,
    commit: (widthPt: number) => void,
  ) {
    if (endResizeRef.current) return;
    const startWidth = width;
    setResizeWidthPx(startWidth);
    const widthAt = (clientX: number) =>
      Math.max(minResizePx, startWidth + clientX - originX);
    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) setResizeWidthPx(widthAt(ev.clientX));
    };
    const endResize = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      endResizeRef.current = null;
      setResizeWidthPx(null);
    };
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) endResize();
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      endResize();
      if (Math.abs(ev.clientX - originX) < 1) {
        onSelect(false);
        return;
      }
      commit(widthAt(ev.clientX) / scale);
    };
    endResizeRef.current = endResize;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  // Below the drag threshold nothing moved: from a grip that is a plain click
  // (select); with Ctrl held it is the multi-select gesture it looks like.
  function startMove(
    originX: number,
    originY: number,
    viaGrip: boolean,
    commit: (dx: number, dy: number) => void,
  ) {
    dragOriginRef.current = { x: originX, y: originY };
    setDragging(true);
    setDragOffset({ x: 0, y: 0 });
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
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        onSelect(!viaGrip);
        return;
      }
      commit(dx, dy);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const spellcheckLang = resolveLang(
    spellcheck,
    typeof document === "undefined" ? null : document.documentElement.lang,
  );

  const pristine = !showsGlyphs;

  const boxTransform =
    [
      dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : "",
      // Turn the box with the text. Placed before scaleX so the fit still
      // stretches along the run's own axis rather than the page's.
      runRotation ? `rotate(${runRotation.deg}deg)` : "",
      fit.scaleX !== 1 ? `scaleX(${fit.scaleX})` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  // Rotate about the text's own origin - the left end of its first
  // baseline - which is the point the flow geometry positions. Otherwise
  // scale from the run's own origin, never its centre.
  const boxTransformOrigin = runRotation
    ? `0 ${firstBaselineFromTop}px`
    : fit.scaleX !== 1
      ? "0 50%"
      : undefined;

  const isOwnElement = (target: EventTarget | null) =>
    target instanceof Node &&
    (!!ref.current?.contains(target) || !!gripsRef.current?.contains(target));
  const leaveHover = (e: { relatedTarget: EventTarget | null }) => {
    setGripZone(null);
    if (!isOwnElement(e.relatedTarget)) setHovered(false);
  };
  const startGrip = (e: ReactPointerEvent<HTMLDivElement>, zone: EdgeZone) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
    e.stopPropagation();
    e.preventDefault();
    ref.current?.blur();
    if (zone === "resize" && onResize) {
      startResize(e.clientX, e.pointerId, onResize);
    } else if (onMove) {
      startMove(e.clientX, e.clientY, true, onMove);
    }
  };
  const showGrips =
    !run.locked &&
    (!!onMove || canResize) &&
    (hovered || selected || dragging || resizeWidthPx !== null);
  const gripProps = (zone: EdgeZone) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => startGrip(e, zone),
    onMouseEnter: () => {
      setHovered(true);
      setGripZone(zone);
    },
    onMouseLeave: leaveHover,
  });
  const resizeHandleLabel = t(
    "pdfTextEditor.run.resizeHandle",
    "Drag to change the width; the text rewraps",
  );
  // Never a child of the box: inside the contentEditable the grips would
  // become editable content.
  const grips =
    showGrips && gripLayer
      ? createPortal(
          <div
            ref={gripsRef}
            className="pdf-editor-run-grips"
            data-testid={`pdf-editor-grips-${run.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              left,
              top,
              width: boxSize?.w ?? resizeWidthPx ?? width,
              height: boxSize?.h ?? height,
              transform: boxTransform,
              transformOrigin: boxTransformOrigin,
            }}
          >
            {GRIP_BANDS.map(({ side, style }) => {
              const zone: EdgeZone =
                side === "right" && canResize ? "resize" : "move";
              if (zone === "move" && !onMove) return null;
              return (
                <div
                  key={side}
                  className="pdf-editor-run-grip"
                  data-grip={zone}
                  style={{
                    ...style,
                    cursor:
                      zone === "resize"
                        ? "ew-resize"
                        : dragging
                          ? "grabbing"
                          : "grab",
                  }}
                  {...gripProps(zone)}
                />
              );
            })}
            {canResize && (
              <div
                className="pdf-editor-run-width-handle"
                data-testid={`pdf-editor-width-handle-${run.id}`}
                role="separator"
                aria-orientation="vertical"
                aria-label={resizeHandleLabel}
                title={resizeHandleLabel}
                {...gripProps("resize")}
              />
            )}
          </div>,
          gripLayer,
        )
      : null;

  const box = (
    <div
      ref={ref}
      data-testid={`pdf-editor-run-${run.id}`}
      data-run-id={run.id}
      className={`pdf-editor-run${pristine ? " is-pristine" : ""}`}
      contentEditable={!run.locked && !run.textReadOnly}
      suppressContentEditableWarning
      spellCheck={spellcheck.enabled && focused}
      lang={spellcheckLang ?? undefined}
      data-locked={run.locked ? "true" : undefined}
      title={
        run.locked
          ? t(
              "pdfTextEditor.run.lockedTitle",
              "Locked - use the Unlock button to edit",
            )
          : run.textReadOnly
            ? t(
                "pdfTextEditor.run.readOnlyOrderTitle",
                "This line's text can't be edited: it mixes right-to-left and left-to-right text in an order the editor can't redraw safely",
              )
            : undefined
      }
      onKeyDown={(e) => {
        // A caret parked on the container (a click past the text lands there)
        // makes Firefox insert the keystroke as a sibling of the line blocks,
        // which reads back as a line the user never typed. Seat it in the
        // block it sits beside before the input applies.
        const sel = window.getSelection();
        if (sel) normalizeContainerCaret(e.currentTarget, sel);
      }}
      onPaste={(e) => {
        // Paste as PLAIN TEXT.
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) normalizeContainerCaret(e.currentTarget, sel);
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
          e.currentTarget.blur();
          startMove(e.clientX, e.clientY, false, onMove);
          return;
        }
        // Shift-click EXTENDS the multi-object selection.
        if (e.shiftKey) {
          e.preventDefault();
          onSelect(true);
          return;
        }
        const caret = caretBesideLines(e.currentTarget, e.clientX, e.clientY);
        if (caret) e.preventDefault();
        pointerFocusRef.current = true;
        e.currentTarget.focus({ preventScroll: true });
        if (caret) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(caret);
        }
        onSelect(false);
      }}
      onFocus={(e) => {
        setFocused(true);
        setTouched(false);
        setMaskColor(readMaskColor(e.currentTarget));
        const el = e.currentTarget;
        // Remember the text at focus so blur can tell if the user edited it.
        focusTextRef.current = readOverlayText(el);
        setGrowBlocked(false);
        setFitWidthPx(null);
        unwrappedLineRef.current = null;
        focusWidestRef.current = Math.max(
          0,
          ...focusTextRef.current
            .split("\n")
            .map((_, i) => lineWidth(focusTextRef.current, i)),
        );
        const fromPointer = pointerFocusRef.current;
        pointerFocusRef.current = false;
        const sel = window.getSelection();
        if (
          !fromPointer &&
          sel &&
          !(sel.rangeCount > 0 && el.contains(sel.anchorNode))
        ) {
          caretToEnd(el, sel);
        }
      }}
      onBlur={(e) => {
        setTouched(false);
        setFitWidthPx(null);
        setMaskColor(null);
        setFocused(false);
        // WebKit routes keystrokes to the SELECTION even when the element has
        // lost focus, so typing after a click-away landed in the run just
        // left. Once focus is genuinely outside the run, its selection goes
        // with it.
        {
          const el = e.currentTarget;
          const sel = window.getSelection();
          if (
            sel &&
            sel.focusNode &&
            el.contains(sel.focusNode) &&
            !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))
          ) {
            sel.removeAllRanges();
          }
        }
        if (!onWrap || !(wantWrap || growWraps)) return;
        const el = e.currentTarget;
        const domText = readOverlayText(el);
        if (domText === focusTextRef.current) return; // not edited
        const widest = measureMaxLineWidth(domText, font);
        if (!wantWrap) {
          if (widest > growOverflowWidth + 1)
            onWrap(growWrapWidth / scale, true);
          return;
        }
        // Reflow to the box the user locked, NOT to `width` - with an exact
        // layout that is however wide the text grew, so nothing ever overflows.
        //
        // Never below the locked width, though. `maxOnPageWidth` keeps a GROWN
        // box on the page and holds back 4px to do it, so for a run that
        // already spans most of the page it comes out a point or two under the
        // width the document itself laid the text out at. Reflowing there costs
        // every line its last word - "...carry out various" wraps "various"
        // onto a line of its own, on lines the user never touched. The locked
        // width is by definition one the text fitted in.
        const target = wrapLockWidth;
        // Only when something actually overflows. Reflowing a paragraph
        // unconditionally re-breaks lines the user never touched: the reflow
        // rebuilds every line, so a two-character edit that still fits could
        // still move words between lines the moment the box lost focus.
        if (widest <= target + 1) return;
        onWrap(target / scale);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // Commit the composed string once, like onInput's non-IME path.
        const el = e.currentTarget;
        commitTypedText(el, readOverlayText(el));
      }}
      onInput={(e) => {
        setTouched(true);
        setEditTick((n) => n + 1);
        editedAtRevisionRef.current = pageRevision ?? -1;
        // Skip intermediate IME steps; compositionend commits the result.
        if (composingRef.current || e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        // Always read hard breaks only - never synthesise newlines from browser
        // soft-wraps.
        commitTypedText(el, readOverlayText(el));
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={leaveHover}
      style={{
        left,
        top,
        width: resizeWidthPx ?? width,
        minHeight: height,
        // Live Ctrl+drag preview: follow the cursor via transform, and
        // float above siblings + dim slightly so the move reads clearly.
        // Drag preview and the width fit both live here, so compose them.
        transform: boxTransform,
        transformOrigin: boxTransformOrigin,
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
        letterSpacing:
          !exact && (run.charSpacingPt || fit.letterSpacing)
            ? `${(run.charSpacingPt ?? 0) * scale + fit.letterSpacing}px`
            : undefined,
        // Same line-height used in the baseline math above, so the CSS
        // baselines land exactly where we computed `top`.
        lineHeight: `${lineHeightPx}px`,
        whiteSpace,
        // Show the glyphs once the run is really being changed, or mid-drag so
        // the Ctrl+drag preview is a visible chip that follows the cursor.
        color: showsGlyphs ? toCssHex(run.fill) : "transparent",
        WebkitTextStrokeColor:
          showsGlyphs && run.stroke ? toCssHex(run.stroke) : undefined,
        WebkitTextStrokeWidth:
          showsGlyphs && run.stroke && run.strokeWidth
            ? `${run.strokeWidth * scale}px`
            : undefined,
        backgroundColor: showsGlyphs
          ? (maskColor ?? contrastingMaskFor(run.fill))
          : findRange && !canHighlightTextRanges()
            ? "color-mix(in srgb, var(--c-highlight) 45%, transparent)"
            : selected
              ? "rgba(44,123,229,0.10)"
              : hovered
                ? "rgba(44,123,229,0.04)"
                : "transparent",
        caretColor: toCssHex(run.fill),
        // Selected keeps a ring: the 10% tint alone is near-invisible over a
        // coloured band. Locked gets a muted ring so it does not read as
        // something you can type into.
        outline: run.locked
          ? hovered || selected
            ? "1px solid rgba(120,120,120,0.55)"
            : "1px dashed transparent"
          : dragging
            ? "2px solid #2c7be5"
            : selected
              ? gripZone || resizeWidthPx !== null
                ? "2px solid #2c7be5"
                : "1px solid #2c7be5"
              : hovered
                ? "1px dashed rgba(44,123,229,0.5)"
                : "1px dashed transparent",
        cursor: run.locked
          ? "default"
          : dragging
            ? "grabbing"
            : resizeWidthPx !== null
              ? "ew-resize"
              : undefined,
        // Clip, never scroll: a box scrolled to keep the caret in view slides
        // every glyph in it off the page's own. Typed text the box cannot
        // wrap widens it instead (`fitWidthPx`).
        overflow: "clip",
      }}
    />
  );

  return (
    <>
      {grips}
      {box}
    </>
  );
}
