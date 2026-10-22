import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/types";
import { toCssHex } from "@app/tools/pdfTextEditor/model/Color";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import {
  resolveLang,
  useSpellcheckPreference,
} from "@app/tools/pdfTextEditor/util/spellcheck";
import {
  embeddedFaceFamily,
  onEmbeddedFaceLoaded,
} from "@app/tools/pdfTextEditor/util/embeddedFace";
import { nearestStandardFont } from "@app/tools/pdfTextEditor/util/fontFamily";
import { fitTextToWidth, NO_FIT } from "@app/tools/pdfTextEditor/util/fitText";
import {
  sampleRunBackground,
  toOpaqueCss,
} from "@app/tools/pdfTextEditor/util/canvasBackground";
import { buildExactLines } from "@app/tools/pdfTextEditor/util/exactLayout";
import { stackLineBoxes } from "@app/tools/pdfTextEditor/util/lineLayout";
import {
  isLinePainted,
  normalizeContainerCaret,
  type PaintLine,
  paintLines,
  paintPlainText,
  plainCaretOffset,
  readOverlayText,
  refitEditedTokens,
  refitTokens,
  restoreCaretOffset,
} from "@app/tools/pdfTextEditor/util/overlayPainter";
import {
  cssFontShorthand,
  measureFontMetrics,
  measureLongestTokenWidth,
  measureMaxLineWidth,
  resetTextMetricsCache,
} from "@app/tools/pdfTextEditor/util/textMetrics";
import { MIN_WRAP_WIDTH_EM } from "@app/tools/pdfTextEditor/commands/ReflowWrapCommand";
import "@app/tools/pdfTextEditor/components/TextRunOverlay.css";

const RENDER_MODE_INVISIBLE = 3;

// Idle time before a wrap-mode run re-wraps. This has to be longer than the gap
// between keystrokes: a reflow physically moves the glyph objects, so one that
// lands mid-burst drags the text - and the caret - out from under the user.
// Measured at 180ms it fired 10 times across 70 typed characters and produced
// 13 backward caret jumps. It only needs to beat the user clicking away.
const LIVE_WRAP_MS = 700;

// Map a font id like "base14:Helvetica-Bold" or "pdf:1234:Arial" to a CSS
// font-family stack that visually approximates the PDFium-rendered glyphs.
function cssFontFamilyFor(fontId: string): string {
  const idx = fontId.lastIndexOf(":");
  const family = idx >= 0 ? fontId.slice(idx + 1) : fontId;
  // The document's own face, when PDFium gave us bytes a FontFace accepts.
  // An unresolved name costs nothing: the browser moves on to the next entry.
  const own = ownFaceFor(fontId);
  // An edit that outgrew a subset now re-emits in the user's INSTALLED face
  // (`device:Calibri`), so the page really is Calibri. Naming it first keeps
  // the overlay measuring and drawing what the page renders; without it
  // nearestStandardFont collapses it to Helvetica and every advance the
  // overlay predicts is a different font's.
  if (fontId.startsWith("device:")) {
    return `"${family}", ${own}"Liberation Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;
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

/** Text widths already carried by the exact layout, no canvas reads needed. */
function exactTextMetrics(lines: PaintLine[]): {
  widestLine: number;
  longestToken: number;
} {
  let widestLine = 0;
  let longestToken = 0;
  for (const line of lines) {
    let lineWidth = 0;
    for (const token of line.tokens) {
      lineWidth += token.advancePx;
      if (/\S/.test(token.text) && token.advancePx > longestToken) {
        longestToken = token.advancePx;
      }
    }
    if (lineWidth > widestLine) widestLine = lineWidth;
  }
  return { widestLine, longestToken };
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
    // The engine's own first-glyph origin is the pen the page used. The slot
    // left is a fallback for a line whose characters carry no position (an
    // all-space line), where there is no ink to disagree with anyway.
    if (line.leftMeasured) return line.left;
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

// PDF advance per em for every character the run already carries. Scale-free,
// so it stays valid as the user zooms.
function charAdvancesEm(
  run: TextRunSnapshot,
): Float32Array | Map<string, number> | null {
  // The engine-captured ASCII table is ready to use: no Map, no loop.
  if (run.charAdvanceEm) return run.charAdvanceEm;
  const starts = run.charStartsX;
  const ends = run.charEndsX;
  if (!starts || !ends || starts.length !== run.text.length) return null;
  if (!(run.fontSize > 0)) return null;
  const map = new Map<string, number>();
  for (let i = 0; i < run.text.length; i += 1) {
    const width = ends[i] - starts[i];
    if (!Number.isFinite(width) || width <= 0) continue;
    const ch = run.text[i];
    if (!map.has(ch)) map.set(ch, width / run.fontSize);
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

/**
 * Page-level callbacks the overlay dispatches through. One stable object per
 * page keeps memoized overlays from re-rendering for new closures whenever the
 * page snapshot changes.
 */
export interface TextRunActions {
  select(runId: string, shiftKey: boolean): void;
  edit(runId: string, nextText: string): void;
  /** Ctrl+drag committed; dx/dy in PDF points. */
  move?(runId: string, dx: number, dy: number): void;
  /** Wrap-mode reflow request; maxWidthPt in PDF points. */
  wrap?(runId: string, maxWidthPt: number): void;
  /** Right-edge drag to a new box width; widthPt in PDF points. */
  resize?(runId: string, widthPt: number): void;
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
  /** Revision of the page bitmap currently on screen. */
  pageRevision?: number;
  actions: TextRunActions;
}

/**
 * Which gesture the pointer is over: the frame, the right edge, or the text
 * interior. The right edge re-wraps the run to a new width; the rest of the
 * frame moves it.
 */
type EdgeZone = "move" | "resize" | null;

/** Grab band around the box, in CSS px. Matches the visible ring's reach. */
const EDGE_PX = 7;

/**
 * Classify a pointer position against the run's own box.
 *
 * The box is contentEditable, so handles cannot be child elements without
 * becoming editable content. Hit-testing the border band instead gives the
 * same affordance with no DOM inside the editable region.
 */
function edgeZoneAt(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  canResize: boolean,
): EdgeZone {
  const r = el.getBoundingClientRect();
  const nearLeft = clientX - r.left <= EDGE_PX;
  const nearRight = r.right - clientX <= EDGE_PX;
  const nearTop = clientY - r.top <= EDGE_PX;
  const nearBottom = r.bottom - clientY <= EDGE_PX;
  if (canResize && nearRight && !nearTop && !nearBottom) return "resize";
  if (nearTop || nearBottom || nearLeft || nearRight) return "move";
  return null;
}

/** One editable HTML element per PDF text run. */
function TextRunOverlayImpl({
  run,
  pageHeight,
  pageWidth,
  transform,
  scale,
  widthMode,
  selected,
  highlighted,
  pageRevision,
  actions,
}: TextRunOverlayProps) {
  const { t } = useTranslation();
  // Subscribed, so toggling the preference re-renders every overlay.
  const spellcheck = useSpellcheckPreference();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Masking a run the user has only clicked into would swap real PDF ink for
  // the overlay's approximation, so hold the pristine bitmap until the first
  // actual edit. Once editing starts the overlay owns the glyphs.
  const [touched, setTouchedState] = useState(false);
  // Live copy for effects: a commit's effect can run after a newer keystroke.
  const touchedRef = useRef(false);
  const setTouched = (next: boolean) => {
    touchedRef.current = next;
    setTouchedState(next);
  };
  const [editTick, setEditTick] = useState(0);
  // Bitmap revision at the last edit. The overlay keeps its glyphs until the
  // raster has painted that revision, so blur cannot reveal stale page ink.
  const editedAtRevisionRef = useRef(-1);
  const paintedSignatureRef = useRef<string | null>(null);
  const pointerFocusRef = useRef(false);
  // The mask has to be the page's own colour, not a guess from the text: a
  // run on a coloured page got a grey band. Sampled from the rendered bitmap
  // once per focus, so the read never lands in the typing path.
  const [maskColor, setMaskColor] = useState<string | null>(null);
  const [faceEpoch, setFaceEpoch] = useState(0);
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
  // Which edge the pointer is over, so the cursor can advertise the gesture
  // before the user commits to it. Null means the text interior.
  const [edgeZone, setEdgeZone] = useState<EdgeZone>(null);
  // Live box width while the right edge is being dragged, in CSS px.
  const [resizeWidthPx, setResizeWidthPx] = useState<number | null>(null);
  // Detaches an in-flight resize's window listeners, so a cancelled or
  // unmounted resize can never commit a width on a later pointerup.
  const endResizeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endResizeRef.current?.(), []);
  const originalBoundsWidthRef = useRef<number>(run.bounds.width);
  // Whether this run was a real (multi-line) paragraph when it first mounted.

  const fontFamily = cssFontFamilyFor(run.fontId);
  const fontWeight = cssWeightFor(run.fontId);
  const fontStyle = cssStyleFor(run.fontId);
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
  // text changes, and a token typed into needs them most right then.
  const heldAdvanceEmRef = useRef<Float32Array | Map<string, number> | null>(
    null,
  );
  if (advanceEm) heldAdvanceEmRef.current = advanceEm;

  useEffect(() => {
    const bump = () => {
      resetTextMetricsCache();
      setFaceEpoch((n) => n + 1);
    };
    const unsubscribe = onEmbeddedFaceLoaded(bump);
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (!cancelled) bump();
      });
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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

  const paintOpts = {
    font,
    fontSizePx,
    advanceEm: heldAdvanceEmRef.current,
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || composingRef.current) return;
    if (!isLinePainted(el)) return;
    refitTokens(el, paintOpts);
  }, [font, fontSizePx]);

  // Layout effect: the engine has already measured this keystroke's pen
  // positions synchronously (EditorStore.dispatch), so the repaint must land
  // before the browser paints. A passive effect would let the browser paint
  // the browser-advance guess first and snap the caret on the next frame -
  // the one-frame lead the user sees as the caret running ahead of the text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement === el;
    // Focus may sit on a descendant mid-edit; either way the run owns the caret
    // and is entitled to re-seat it. A blurred run is not.
    const ownsFocus = el.contains(document.activeElement);
    if (active && composingRef.current) return;
    const wantSignature = freshExact ? freshExact.signature : "";
    const painted = isLinePainted(el);
    // Cheapest exit first: a blurred overlay already carrying this exact
    // layout needs neither a DOM text read nor caret math. On zoom/scroll that
    // is every overlay except the focused one.
    if (
      !ownsFocus &&
      painted === !!freshExact &&
      paintedSignatureRef.current === wantSignature
    ) {
      return;
    }
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
    if (!freshExact && painted && domText === run.text) return;
    if (
      domText === run.text &&
      paintedSignatureRef.current === wantSignature &&
      painted === !!freshExact
    ) {
      return;
    }
    // Keyed off the selection, not the focus: replaceChildren below detaches
    // whatever node the caret sits in, and a caret this run holds without being
    // document.activeElement is still a caret the next insert needs.
    const caret = ownsFocus ? plainCaretOffset(el) : null;
    if (freshExact) {
      paintLines(el, freshExact.lines, paintOpts);
    } else {
      paintPlainText(el, run.text);
    }
    paintedSignatureRef.current = wantSignature;
    // Only while the run still holds focus. A selection outlives the blur that
    // ended the edit, so re-seating it into a blurred run takes focus BACK -
    // and the user's next click elsewhere then fires this run's blur handler,
    // dispatching a spurious wrap that also wipes the redo stack.
    if (caret !== null && ownsFocus) restoreCaretOffset(el, caret);
  }, [run.text, freshExact, font, fontSizePx, touched, faceEpoch]);

  const anchor = transform.apply(run.matrix.e, run.matrix.f);
  const flowLeft = anchor.x * scale;

  const invisible = run.renderMode === RENDER_MODE_INVISIBLE;
  // The run owns its glyphs from the first keystroke. After blur it keeps them
  // until the bitmap has painted the edit, so a deferred raster cannot flash
  // the page's older ink under a caret that has already moved on.
  const hasEdit = editedAtRevisionRef.current >= 0;
  const pageCaughtUp =
    pageRevision === undefined || pageRevision > editedAtRevisionRef.current;
  const showsGlyphs = (touched || (hasEdit && !pageCaughtUp)) && !invisible;

  const exactMetrics = useMemo(
    () => (freshExact ? exactTextMetrics(freshExact.lines) : null),
    [freshExact],
  );
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
  // typed text wider than the original bounds isn't clipped. The exact layout
  // already carries every token's advance; measuring the whole string through
  // the canvas again would be duplicated work on the hot path.
  const measuredWidth = exactMetrics
    ? exactMetrics.widestLine
    : measureMaxLineWidth(run.text, font);
  // Width behaviour is user-controlled: - "grow": box widens to the right to
  // fit the content.
  const wrapMode = widthMode === "wrap";
  const wrapLockWidth = Math.max(
    (run.wrapWidthPt ?? originalBoundsWidthRef.current) * scale,
    fontSizePx * MIN_WRAP_WIDTH_EM,
  );
  // The mode the user picked, and nothing else. Forcing a paragraph to wrap in
  // Grow made the two modes indistinguishable for body text and contradicted
  // the control's own hint ("Boxes widen to the right as you type (no
  // wrapping)").
  const wantWrap = wrapMode;
  const left = exact ? exact.leftPx : flowLeft;
  // Wrap keeps the box on the page - that is the whole point of the mode, and
  // its overflow goes onto new lines instead. Grow has nowhere to put the
  // overflow, so capping it there just hides what the user is typing: it grew
  // to the page edge and then clipped everything beyond, measured at 2944px of
  // invisible text on a single-line run.
  const pageCap = Math.max(fontSizePx * 4, pageWidth * scale - left - 4);
  // Wrapping cannot break inside a word, so a box narrower than the longest one
  // hides its tail however the lines are broken - 707px of a held-down key
  // measured invisible, with the caret out there past the box edge.
  //
  // The longest token overrides even the page edge. Stopping there is right for
  // text that can wrap, because the overflow has somewhere else to go; a word
  // with no break in it has nowhere, so the cap stops protecting the page
  // margin and just hides what the user is typing.
  // The box has to fit the glyphs the overlay will actually paint. The exact
  // layout describes the engine's advances; the browser's own longest token can
  // be wider for a face it substitutes, and taking only the engine width made
  // the wrap box shrink under the painted word. Keep the larger floor whenever
  // wrapping owns the width.
  const longestTokenWidth = wantWrap
    ? Math.max(
        exactMetrics?.longestToken ?? 0,
        measureLongestTokenWidth(run.text, font),
      )
    : 0;
  const wrapWidth = Math.max(
    Math.min(wrapLockWidth, pageCap),
    longestTokenWidth + fontSizePx,
  );
  const maxOnPageWidth = wantWrap ? pageCap : Number.POSITIVE_INFINITY;
  const naturalWidth = wantWrap
    ? wrapLockWidth
    : Math.max(pdfWidth, measuredWidth + fontSizePx);
  const flowWidth = Math.min(naturalWidth, maxOnPageWidth);

  const top = exact ? exact.topPx : flowTop;
  // Width must not depend on anything that can flip between renders, or the box
  // visibly pumps between two sizes while the user types. Two things could:
  // room for the caret appeared only WHILE focused, and the measured fallback
  // dropped out the moment `freshExact` arrived. The engine now re-measures
  // every 100ms, so both flipped about ten times a second. Always keep the
  // slack, always take the wider of the two - the result is a pure function of
  // the layout, the text and the font, and a few pixels of margin costs
  // nothing next to a box that will not sit still.
  const exactWidth = exact
    ? Math.max(exact.widthPx + fontSizePx * 0.5, measuredWidth + fontSizePx)
    : 0;
  // Capped at the page edge: an editing box hanging off the page reads as
  // broken, and the glyphs under it would be off-page anyway.
  //
  // A line longer than that is therefore clipped while it is being typed, and
  // the reflow on blur brings it back onto the page. The alternative - letting
  // the box wrap the line - is what put the overlay a full line out of register
  // with the bitmap: the PDF draws each line as ONE text object at one pen
  // origin and cannot wrap, so an overlay that wraps stops describing the page
  // underneath it.
  // Wrap holds its width and pushes overflow onto new lines; widening to the
  // page edge instead is Grow's job, and doing both makes the modes identical.
  const userWidthPx = (run.wrapWidthPt ?? 0) * scale;
  const width = wantWrap
    ? wrapWidth
    : Math.max(exact ? exactWidth : flowWidth, userWidthPx);
  const height = exact ? exact.heightPx : flowHeight;
  // An exact layout is never wrapped - its lines are the PDF's own. Only the
  // plain-text fallback, where CSS flow genuinely owns the layout, may wrap.
  const whiteSpace: "pre" | "pre-wrap" =
    !exact && wantWrap ? "pre-wrap" : "pre";

  // Wrap AS THE USER TYPES, not only on blur. Deferring it meant the overflow
  // sat invisible past the box edge until they clicked away - over a thousand
  // pixels of it - and the caret only dropped onto the new line at that point.
  // The reflow shares EditTextCommand's coalesce key and ignores the time
  // window, so running it mid-burst does not fragment undo.
  const wrapTarget = wrapWidth;
  useEffect(() => {
    if (!wantWrap || !actions.wrap || !focused) return;
    const el = ref.current;
    if (!el || composingRef.current) return;
    const widest = exactMetrics
      ? exactMetrics.widestLine
      : measureMaxLineWidth(readOverlayText(el), font);
    if (widest <= wrapTarget + 1) return;
    const timer = window.setTimeout(
      () => actions.wrap?.(run.id, wrapTarget / scale),
      LIVE_WRAP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    wantWrap,
    actions,
    run.id,
    focused,
    editTick,
    wrapTarget,
    exactMetrics,
    font,
    scale,
  ]);

  // Which dictionary the browser should load. "auto" falls back to the
  // page's own language, which is what the element would inherit anyway.
  // The reflow lays text out along the page axis, so a turned run has no
  // meaningful width to drag.
  const canResize = !!actions.resize && !runRotation;
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
        actions.select(run.id, false);
        return;
      }
      commit(widthAt(ev.clientX) / scale);
    };
    endResizeRef.current = endResize;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  const spellcheckLang = resolveLang(
    spellcheck,
    typeof document === "undefined" ? null : document.documentElement.lang,
  );

  const pristine = !showsGlyphs;

  return (
    <div
      ref={ref}
      data-testid={`pdf-editor-run-${run.id}`}
      className={`pdf-editor-run${pristine ? " is-pristine" : ""}`}
      contentEditable={!run.locked}
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
        const zone = edgeZoneAt(
          e.currentTarget,
          e.clientX,
          e.clientY,
          canResize,
        );
        if (zone === "resize" && actions.resize) {
          e.preventDefault();
          e.currentTarget.blur();
          startResize(e.clientX, e.pointerId, (widthPt) =>
            actions.resize?.(run.id, widthPt),
          );
          return;
        }

        // Ctrl+drag still moves from anywhere inside, so existing muscle
        // memory keeps working; grabbing the frame is the discoverable path.
        if ((e.ctrlKey || e.metaKey || zone === "move") && actions.move) {
          const viaFrame = zone === "move" && !(e.ctrlKey || e.metaKey);
          if (viaFrame) e.preventDefault();
          dragOriginRef.current = { x: e.clientX, y: e.clientY };
          setDragging(true);
          setDragOffset({ x: 0, y: 0 });
          e.currentTarget.blur();
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
            // Below the drag threshold nothing moved. From the frame that is
            // a plain click (select); with Ctrl held it is the multi-select
            // gesture it looks like.
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
              actions.select(run.id, !viaFrame);
              return;
            }
            actions.move?.(run.id, dx, dy);
          };
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          return;
        }
        // Shift-click EXTENDS the multi-object selection.
        if (e.shiftKey) {
          e.preventDefault();
          actions.select(run.id, true);
          return;
        }
        pointerFocusRef.current = true;
        e.currentTarget.focus({ preventScroll: true });
        actions.select(run.id, false);
      }}
      onFocus={(e) => {
        setFocused(true);
        setTouched(false);
        setMaskColor(readMaskColor(e.currentTarget));
        const el = e.currentTarget;
        // Remember the text at focus so blur can tell if the user edited it.
        focusTextRef.current = readOverlayText(el);
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
        // Backend strategy: pre-warm the per-char charcode cache for the whole
        // page in the background.
        void (async () => {
          try {
            const [
              { getActiveCharcodeStrategy },
              { prewarmBackendCacheForPage },
            ] = await Promise.all([
              import("@app/tools/pdfTextEditor/charcode/CharcodeStrategy"),
              import("@app/tools/pdfTextEditor/charcode/charcodeRegistry"),
            ]);
            if (getActiveCharcodeStrategy() !== "backend") return;
            await prewarmBackendCacheForPage(run.pageIndex);
          } catch {
            /* prewarm is best-effort, never block focus */
          }
        })();
      }}
      onBlur={(e) => {
        setTouched(false);
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
        // Wrap mode: when the just-edited content overflows the locked box
        // width.
        if (!wantWrap || !actions.wrap) return;
        const el = e.currentTarget;
        const domText = readOverlayText(el);
        if (domText === focusTextRef.current) return; // not edited
        const widest = measureMaxLineWidth(domText, font);
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
        // still move words between lines the moment the box lost focus. The
        // base branch never reflowed here at all.
        if (widest <= target + 1) return;
        actions.wrap?.(run.id, target / scale);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // Commit the composed string once, like onInput's non-IME path.
        setTouched(true);
        setEditTick((n) => n + 1);
        const el = e.currentTarget;
        const text = readOverlayText(el).replace(/\u00A0/g, " ");
        if (text === run.text) return;
        editedAtRevisionRef.current = pageRevision ?? -1;
        actions.edit(run.id, text);
      }}
      onInput={(e) => {
        setTouched(true);
        setEditTick((n) => n + 1);
        // Skip intermediate IME steps; compositionend commits the result.
        if (composingRef.current || e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        // Re-fit the token the user just typed into. Its painted width is the
        // PDF's advance for the ORIGINAL string, so leaving it alone lays the
        // new text out at the browser's own advances and the caret drifts off
        // the glyphs on the page, a pixel or so per keystroke.
        if (isLinePainted(el)) refitEditedTokens(el, paintOpts);
        // Always read hard breaks only - never synthesise newlines from browser
        // soft-wraps.
        const raw = readOverlayText(el);
        const text = raw.replace(/\u00A0/g, " ");
        // A second input event for the same text must not arm the
        // keep-glyphs-until-painted latch: no command runs, so no page
        // revision will ever catch it and the mask would stay up after blur.
        if (text === run.text) return;
        editedAtRevisionRef.current = pageRevision ?? -1;
        actions.edit(run.id, text);
        // No per-keystroke reflow: while focused, the box is CAPPED to the page
        // and wraps via CSS, so the editing view is always on-page.
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setEdgeZone(null);
      }}
      onPointerMove={(e) => {
        // Only while idle: mid-drag the cursor is owned by the gesture.
        if (run.locked || dragging) return;
        if (resizeWidthPx !== null) return;
        setEdgeZone(
          edgeZoneAt(e.currentTarget, e.clientX, e.clientY, canResize),
        );
      }}
      style={{
        left,
        top,
        width: resizeWidthPx ?? width,
        minHeight: height,
        // Live Ctrl+drag preview: follow the cursor via transform, and
        // float above siblings + dim slightly so the move reads clearly.
        // Drag preview and the width fit both live here, so compose them.
        transform:
          [
            dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : "",
            // Turn the box with the text. Placed before scaleX so the fit still
            // stretches along the run's own axis rather than the page's.
            runRotation ? `rotate(${runRotation.deg}deg)` : "",
            fit.scaleX !== 1 ? `scaleX(${fit.scaleX})` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        // Rotate about the text's own origin - the left end of its first
        // baseline - which is the point the flow geometry positions. Otherwise
        // scale from the run's own origin, never its centre.
        transformOrigin: runRotation
          ? `0 ${firstBaselineFromTop}px`
          : fit.scaleX !== 1
            ? "0 50%"
            : undefined,
        opacity: dragging ? 0.75 : 1,
        zIndex: dragging ? 20 : undefined,
        // Only the tint and opacity settle are animated.
        transition: dragging
          ? "none"
          : "box-shadow 140ms ease-out, opacity 120ms ease-out",
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
          : "transparent",
        // Tint through an inset shadow rather than background-color: the
        // opaque edit mask has to stay the page's colour, while the blue
        // selection wash must survive the first keystroke instead of snapping
        // to white. A 5% wash keeps the run visibly selected while editing.
        boxShadow: highlighted
          ? "inset 0 0 0 9999px rgba(255,217,0,0.45)"
          : selected
            ? `inset 0 0 0 9999px rgba(44,123,229,${showsGlyphs ? "0.05" : "0.10"})`
            : hovered
              ? "inset 0 0 0 9999px rgba(44,123,229,0.04)"
              : "none",
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
              ? edgeZone || resizeWidthPx !== null
                ? "2px solid #2c7be5"
                : "1px solid #2c7be5"
              : hovered
                ? "1px dashed rgba(44,123,229,0.5)"
                : "1px dashed transparent",
        // The cursor is the affordance: the box advertises move/resize on the
        // frame and keeps the I-beam over the text.
        cursor: run.locked
          ? "default"
          : dragging
            ? "grabbing"
            : resizeWidthPx !== null || edgeZone === "resize"
              ? "ew-resize"
              : edgeZone === "move"
                ? "grab"
                : undefined,
        overflow: "hidden",
      }}
    />
  );
}

// A store patch re-renders the page list, but only the run whose visible data
// changed needs to repaint. Snapshots are fresh objects per patch, so compare
// the fields the overlay actually reads rather than object identity - this is
// also safe for session-only changes such as lock, which bump the page
// revision without marking the run dirty.
function sameNumbers(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function sameRun(a: TextRunSnapshot, b: TextRunSnapshot): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.pageIndex !== b.pageIndex ||
    a.text !== b.text ||
    a.fontId !== b.fontId ||
    a.fontSize !== b.fontSize ||
    a.fontSubset !== b.fontSubset ||
    a.renderMode !== b.renderMode ||
    a.strokeWidth !== b.strokeWidth ||
    (a.charSpacingPt ?? 0) !== (b.charSpacingPt ?? 0) ||
    (a.paragraphLineHeight ?? 0) !== (b.paragraphLineHeight ?? 0) ||
    (a.paragraphLineCount ?? 1) !== (b.paragraphLineCount ?? 1) ||
    (a.paragraphSlotCount ?? 0) !== (b.paragraphSlotCount ?? 0) ||
    !!a.locked !== !!b.locked ||
    (a.wrapWidthPt ?? null) !== (b.wrapWidthPt ?? null)
  ) {
    return false;
  }
  if (
    a.bounds.x !== b.bounds.x ||
    a.bounds.y !== b.bounds.y ||
    a.bounds.width !== b.bounds.width ||
    a.bounds.height !== b.bounds.height ||
    a.matrix.a !== b.matrix.a ||
    a.matrix.b !== b.matrix.b ||
    a.matrix.c !== b.matrix.c ||
    a.matrix.d !== b.matrix.d ||
    a.matrix.e !== b.matrix.e ||
    a.matrix.f !== b.matrix.f ||
    a.fill.r !== b.fill.r ||
    a.fill.g !== b.fill.g ||
    a.fill.b !== b.fill.b ||
    a.fill.a !== b.fill.a
  ) {
    return false;
  }
  const as = a.stroke;
  const bs = b.stroke;
  if (!!as !== !!bs) return false;
  if (
    as &&
    bs &&
    (as.r !== bs.r || as.g !== bs.g || as.b !== bs.b || as.a !== bs.a)
  ) {
    return false;
  }
  return (
    sameNumbers(a.charStartsX, b.charStartsX) &&
    sameNumbers(a.charEndsX, b.charEndsX) &&
    a.charAdvanceEm === b.charAdvanceEm &&
    sameNumbers(a.paragraphBaselines, b.paragraphBaselines) &&
    sameNumbers(a.paragraphLineLefts, b.paragraphLineLefts)
  );
}

function propsEqual(
  prev: TextRunOverlayProps,
  next: TextRunOverlayProps,
): boolean {
  return (
    prev.pageHeight === next.pageHeight &&
    prev.pageWidth === next.pageWidth &&
    prev.transform === next.transform &&
    prev.scale === next.scale &&
    prev.widthMode === next.widthMode &&
    prev.selected === next.selected &&
    prev.highlighted === next.highlighted &&
    prev.pageRevision === next.pageRevision &&
    prev.actions === next.actions &&
    sameRun(prev.run, next.run)
  );
}

export const TextRunOverlay = memo(TextRunOverlayImpl, propsEqual);
