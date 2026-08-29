import { useEffect, useMemo, useRef, useState } from "react";
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
  embeddedFaceFamily,
  onEmbeddedFaceLoaded,
} from "@app/tools/pdfTextEditor/v2/util/embeddedFace";
import { nearestStandardFont } from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import {
  fitTextToWidth,
  NO_FIT,
} from "@app/tools/pdfTextEditor/v2/util/fitText";
import {
  sampleRunBackground,
  toOpaqueCss,
} from "@app/tools/pdfTextEditor/v2/util/canvasBackground";
import { buildExactLines } from "@app/tools/pdfTextEditor/v2/util/exactLayout";
import { stackLineBoxes } from "@app/tools/pdfTextEditor/v2/util/lineLayout";
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
} from "@app/tools/pdfTextEditor/v2/util/overlayPainter";
import {
  cssFontShorthand,
  measureFontMetrics,
  measureLongestTokenWidth,
  measureMaxLineWidth,
  resetTextMetricsCache,
} from "@app/tools/pdfTextEditor/v2/util/textMetrics";
import "@app/tools/pdfTextEditor/v2/components/TextRunOverlay.css";

const RENDER_MODE_INVISIBLE = 3;

const SETTLE_MS = 400;

const STALL_MS = 250;

// Idle time before a wrap-mode run re-wraps. This has to be longer than the gap
// between keystrokes: a reflow physically moves the glyph objects, so one that
// lands mid-burst drags the text - and the caret - out from under the user.
// Measured at 180ms it fired 10 times across 70 typed characters and produced
// 13 backward caret jumps. It only needs to beat the user clicking away.
const LIVE_WRAP_MS = 700;

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
  const page = el.closest("[data-testid^='v2-page-']");
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

// PDF advance per em for every character the run already carries. Scale-free,
// so it stays valid as the user zooms.
function charAdvancesEm(run: TextRunSnapshot): Map<string, number> | null {
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
  pageRevision?: number;
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
  pageRevision,
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
  // Masking a run the user has only clicked into swaps real PDF ink for a
  // CSS approximation, so hold the pristine bitmap until an actual edit.
  const [touched, setTouched] = useState(false);
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
  const [faceEpoch, setFaceEpoch] = useState(0);
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
  const heldAdvanceEmRef = useRef<Map<string, number> | null>(null);
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
    if (active && touched && !(freshExact && domText === run.text)) return;
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
    const caret = plainCaretOffset(el);
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
    originalBoundsWidthRef.current * scale,
    fontSizePx * 4,
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
  const longestTokenWidth = measureLongestTokenWidth(run.text, font);
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
  const width = wantWrap ? wrapWidth : exact ? exactWidth : flowWidth;
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
    if (!wantWrap || !onWrap || !focused) return;
    const el = ref.current;
    if (!el || composingRef.current) return;
    const widest = measureMaxLineWidth(readOverlayText(el), font);
    if (widest <= wrapTarget + 1) return;
    const timer = window.setTimeout(
      () => onWrap(wrapTarget / scale),
      LIVE_WRAP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wantWrap, onWrap, focused, editTick, wrapTarget, font, scale]);

  // Which dictionary the browser should load. "auto" falls back to the
  // page's own language, which is what the element would inherit anyway.
  const spellcheckLang = resolveLang(
    spellcheck,
    typeof document === "undefined" ? null : document.documentElement.lang,
  );

  const pristine = !showsGlyphs;

  return (
    <div
      ref={ref}
      data-testid={`v2-run-${run.id}`}
      className={`v2-run${pristine ? " is-pristine" : ""}`}
      contentEditable={!run.locked}
      suppressContentEditableWarning
      spellCheck={spellcheck.enabled && focused}
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
      onKeyDown={(e) => {
        // A caret parked on the container (a click past the text lands there)
        // makes Firefox insert the keystroke as a sibling of the line blocks,
        // which reads back as a line the user never typed. Seat it in the
        // block it sits beside before the input applies.
        const sel = window.getSelection();
        if (sel)
          normalizeContainerCaret(e.currentTarget as HTMLDivElement, sel);
      }}
      onPaste={(e) => {
        // Paste as PLAIN TEXT.
        e.preventDefault();
        const sel = window.getSelection();
        if (sel)
          normalizeContainerCaret(e.currentTarget as HTMLDivElement, sel);
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
            // Below the drag threshold this was a Ctrl+click, not a move, so
            // treat it as the multi-select gesture it looks like.
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
              onSelect(true);
              return;
            }
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
        pointerFocusRef.current = true;
        (e.currentTarget as HTMLDivElement).focus({ preventScroll: true });
        onSelect(false);
      }}
      onFocus={(e) => {
        setFocused(true);
        setTouched(false);
        setMaskColor(readMaskColor(e.currentTarget as HTMLDivElement));
        const el = e.currentTarget as HTMLDivElement;
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
        setTouched(false);
        setMaskColor(null);
        setFocused(false);
        // WebKit routes keystrokes to the SELECTION even when the element has
        // lost focus, so typing after a click-away landed in the run just
        // left. Once focus is genuinely outside the run, its selection goes
        // with it.
        {
          const el = e.currentTarget as HTMLDivElement;
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
        if (!wantWrap || !onWrap) return;
        const el = e.currentTarget as HTMLDivElement;
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
        onWrap(target / scale);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // Commit the composed string once, like onInput's non-IME path.
        const el = e.currentTarget as HTMLDivElement;
        onEdit(readOverlayText(el).replace(/\u00A0/g, " "));
      }}
      onInput={(e) => {
        setTouched(true);
        setEditTick((n) => n + 1);
        editedAtRevisionRef.current = pageRevision ?? -1;
        // Skip intermediate IME steps; compositionend commits the result.
        if (composingRef.current || (e.nativeEvent as InputEvent).isComposing)
          return;
        const el = e.currentTarget as HTMLDivElement;
        // Re-fit the token the user just typed into. Its painted width is the
        // PDF's advance for the ORIGINAL string, so leaving it alone lays the
        // new text out at the browser's own advances and the caret drifts off
        // the glyphs on the page, a pixel or so per keystroke.
        if (isLinePainted(el)) refitEditedTokens(el, paintOpts);
        // Always read hard breaks only - never synthesise newlines from browser
        // soft-wraps.
        const raw = readOverlayText(el);
        const text = raw.replace(/\u00A0/g, " ");
        onEdit(text);
        // No per-keystroke reflow: while focused, the box is CAPPED to the page
        // and wraps via CSS, so the editing view is always on-page.
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        left,
        top,
        width,
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
          : highlighted
            ? "rgba(255,217,0,0.45)"
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
          : dragging || selected
            ? "1px solid #2c7be5"
            : hovered
              ? "1px dashed rgba(44,123,229,0.5)"
              : "1px dashed transparent",
        // Locked runs are not editable, so don't offer an I-beam.
        cursor: run.locked ? "default" : undefined,
        overflow: "hidden",
      }}
    />
  );
}
