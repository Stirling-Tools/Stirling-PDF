import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { FindMatch } from "@editor/tools/pdfTextEditor/store/Selection";
import { Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useReviewing } from "@editor/tools/pdfTextEditor/store/reviewMode";
import { Button } from "@editor/ui/Button";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  PageRect,
  PageSnapshot,
  TextRange,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import { TextRunOverlay } from "@editor/tools/pdfTextEditor/components/TextRunOverlay";
import { canResizeRun } from "@editor/tools/pdfTextEditor/commands/resizeRun";
import {
  growEdges,
  type GrowEdge,
} from "@editor/tools/pdfTextEditor/util/growEdge";
import { TableOverlay } from "@editor/tools/pdfTextEditor/components/TableOverlay";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import {
  pageAttention,
  type PageAttention,
} from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import { AttentionBadge } from "@editor/tools/pdfTextEditor/components/AttentionBadge";
import { ImageHandle } from "@editor/tools/pdfTextEditor/components/ImageHandle";
import { readShownImagePixels } from "@editor/tools/pdfTextEditor/util/imagePixels";
import { visibleImageBounds } from "@editor/tools/pdfTextEditor/util/imageClip";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { ShapeHandle } from "@editor/tools/pdfTextEditor/components/ShapeHandle";
import { AnnotationOutline } from "@editor/tools/pdfTextEditor/components/AnnotationOutline";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { PageGuides } from "@editor/tools/pdfTextEditor/components/PageRulers";
import { useDevicePixelRatio } from "@editor/tools/pdfTextEditor/hooks/useDevicePixelRatio";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import type { PdfRenderMode } from "@editor/services/preferencesService";
import { PDF_RENDER_FILTERS } from "@editor/components/viewer/pdfRenderFilters";

interface PageViewProps {
  document: EditorDocument;
  /** Store, for the table overlay's dispatch/selection. */
  store: EditorStore;
  page: PageSnapshot;
  /** Fires when the page enters the viewport for the first time. */
  onFirstVisible?: (pageIndex: number) => void;
  /** Fires when the page's first render finishes, painted or failed. */
  onFirstRendered?: (pageIndex: number) => void;
  /** Fires the first time the page's bitmap is painted, including on a retry. */
  onFirstPainted?: () => void;
  /** The viewer's reading mode; tints the page the same way the viewer does. */
  renderMode?: PdfRenderMode;
  scale: number;
  widthMode: import("@editor/tools/pdfTextEditor/types").WidthMode;
  /** Show the page rulers and alignment guides. */
  showRulers?: boolean;
  selectedRunIds: string[];
  selectedImageIds: string[];
  selectedShapeIds: string[];
  /** The find-bar occurrence on show. */
  findMatch?: FindMatch | null;
  /** The AnnotationBox id of the selected form field widget. */
  selectedFormFieldId?: string | null;
  onSelectRun: (runId: string, shiftKey: boolean) => void;
  onSelectImage: (imageId: string) => void;
  onSelectShape: (shapeId: string, extend: boolean) => void;
  /** Selects a form field widget by its AnnotationBox id. */
  onSelectFormField?: (annotationId: string) => void;
  /** Fires when a shape drag completes; dx/dy in raw PDF points. */
  onMoveShape?: (
    pageIndex: number,
    shapeId: string,
    dx: number,
    dy: number,
  ) => void;
  onEditRun: (pageIndex: number, runId: string, nextText: string) => void;
  /** The characters selected inside a run's box, while it has focus. */
  onSelectRunText?: (runId: string, range: TextRange | null) => void;
  /** The characters selected inside the one selected run. */
  selectedTextRange?: TextRange | null;
  /** Ctrl+drag committed; dx/dy in PDF points. */
  onMoveRun?: (
    pageIndex: number,
    runId: string,
    dx: number,
    dy: number,
  ) => void;
  /**
   * Wrap-mode reflow request; maxWidthPt in PDF points. Returns the run's text
   * after the wrap, or null when it was refused because its new lines had
   * nowhere clear to go.
   */
  onWrapRun?: (
    pageIndex: number,
    runId: string,
    maxWidthPt: number,
    keepClearBelow?: boolean,
  ) => string | null | void;
  /** The run with the engine's pen positions for its current text, read now. */
  onMeasureRun?: (pageIndex: number, runId: string) => TextRunSnapshot | null;
  /** Right-edge drag to a new box width; widthPt in PDF points. */
  onResizeRun?: (pageIndex: number, runId: string, widthPt: number) => void;
  /** Fires when the user clicks on a non-text area of the page. */
  onPageClick?: (pageIndex: number, pageX: number, pageY: number) => void;
  /** Fires when an image's drag OR resize completes. */
  onTransformImage?: (
    pageIndex: number,
    imageId: string,
    next: { x: number; y: number; width: number; height: number },
  ) => void;
}

// Nearest scrolling ancestor, or null when the page scrolls with the document.
// IntersectionObserver clips a target against every scrolling ancestor BEFORE
// root/rootMargin are applied, so a document-rooted observer can never see past
// the stage's ScrollArea and its rootMargin is dead. Rooting at the scroller
// itself is what makes the prefetch margin real.
function nearestScrollRoot(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const overflow = `${style.overflowY} ${style.overflowX}`;
    if (/auto|scroll|overlay/.test(overflow)) return node;
  }
  return null;
}

/**
 * One PDF page: a PDFium-rendered bitmap plus an overlay with one positioned,
 * editable element per text run. Memoised: with every page read, re-rendering them
 * all on each store change takes seconds, so a caller must pass handlers that
 * keep their identity across renders.
 */
export const PageView = memo(function PageView({
  document,
  store,
  page,
  renderMode = "normal",
  scale,
  widthMode,
  showRulers,
  selectedRunIds,
  selectedImageIds,
  selectedShapeIds,
  findMatch,
  selectedFormFieldId = null,
  onSelectRun,
  onSelectImage,
  onSelectShape,
  onSelectFormField,
  onMoveShape,
  onEditRun,
  onSelectRunText,
  selectedTextRange,
  onMoveRun,
  onWrapRun,
  onMeasureRun,
  onResizeRun,
  onPageClick,
  onTransformImage,
  onFirstVisible,
  onFirstRendered,
  onFirstPainted,
}: PageViewProps) {
  const { t } = useTranslation();
  const reviewing = useReviewing();
  // Accessibility belongs to the review: editing shows no attention badges.
  const attention = useMemo(
    (): PageAttention =>
      ACCESSIBILITY_EDITING && reviewing
        ? pageAttention(document, page)
        : { images: new Map(), runs: new Map() },
    [document, page, reviewing],
  );
  const runGrowEdges = useMemo(
    () =>
      widthMode === "grow" ? growEdges(page.runs) : new Map<string, GrowEdge>(),
    [page.runs, widthMode],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // `raster` is the CSS layout size; the bitmap itself renders at deviceScale
  // so a HiDPI display gets real pixels instead of a browser-upscaled blur.
  // The canvas element pins its CSS width/height to `raster`, which is what
  // lets the bitmap resolution move independently of the layout.
  const raster = PdfiumPageRenderer.rasterSize(page.width, page.height, scale);
  const cssScale = raster.width / page.width;
  const dpr = useDevicePixelRatio();
  const deviceScale = PdfiumPageRenderer.deviceScale(
    page.width,
    page.height,
    scale,
    dpr,
  );
  // Raw-PDF -> display (CropBox/rotation) transform for this page. Identity for
  // normal pages, so every overlay/click computation below is unchanged there.
  const transform = DisplayTransform.fromData(page.display);
  // The overlay's editing mask is sampled from the untinted bitmap, so both
  // surfaces get the same filter or the mask reads as a patch on the page.
  const pageFilter = PDF_RENDER_FILTERS[renderMode];
  // Per document: a newly opened file reuses this view for its page of the same index.
  const visibleDocRef = useRef<typeof document | null>(null);
  const firstRenderedDocRef = useRef<typeof document | null>(null);
  const [gripLayer, setGripLayer] = useState<HTMLDivElement | null>(null);
  const firstPaintedDocRef = useRef<typeof document | null>(null);
  const [paintedRevision, setPaintedRevision] = useState(-1);
  // Read by the render effect, which must not re-run when it changes.
  const paintedRevisionRef = useRef(-1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // True when this page is within ~one viewport of the visible area.
  const [nearViewport, setNearViewport] = useState(false);

  // First-visible: lazy-populate the page's runs/images.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onFirstVisible) return;
    if (visibleDocRef.current === document) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && visibleDocRef.current !== document) {
            visibleDocRef.current = document;
            onFirstVisible(page.pageIndex);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [document, page.pageIndex, onFirstVisible]);

  // Near-viewport observer drives rendering with a wide rootMargin so the
  // bitmap is ready just before the page scrolls in.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setNearViewport(entry.isIntersecting);
        }
      },
      { root: nearestScrollRoot(el), rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    store.setPageNearViewport(page.pageIndex, true);
    return () => store.setPageNearViewport(page.pageIndex, false);
  }, [store, page.pageIndex, nearViewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!nearViewport) {
      // Far from the viewport: free the bitmap (a 4x-zoom A4 canvas is ~32MB).
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }
    let cancelled = false;
    let settleTimer = 0;
    if (!canvas) return;
    const live = document.page(page.pageIndex);
    const revision = page.revision;
    const markPainted = () => {
      paintedRevisionRef.current = revision;
      setPaintedRevision(revision);
    };
    const noteFirstRender = () => {
      if (firstRenderedDocRef.current === document) return;
      firstRenderedDocRef.current = document;
      onFirstRendered?.(page.pageIndex);
    };
    const noteFirstPaint = () => {
      if (firstPaintedDocRef.current === document) return;
      firstPaintedDocRef.current = document;
      onFirstPainted?.();
    };
    const paintFull = () => {
      PdfiumPageRenderer.render(document, live, deviceScale)
        .then((image) => {
          if (cancelled || !canvasRef.current) return;
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.putImageData(image, 0, 0);
          setRenderError(null);
          markPainted();
          noteFirstRender();
          noteFirstPaint();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          console.warn(
            `[pdf-editor] page ${page.pageIndex} render failed`,
            err,
          );
          setRenderError(msg);
          // Flip the first-rendered flag on error too, or the loading overlay never dismisses.
          noteFirstRender();
        });
    };
    const area = changedPixels(
      live,
      deviceScale,
      canvas,
      paintedRevisionRef.current,
    );
    if (area) {
      // Redrawing the whole page, scan image and all, is most of what a keystroke costs.
      PdfiumPageRenderer.renderArea(document, live, deviceScale, area)
        .then((image) => {
          if (cancelled || !canvasRef.current) return;
          canvas.getContext("2d")?.putImageData(image, area.x, area.y);
          setRenderError(null);
          markPainted();
          settleTimer = window.setTimeout(
            paintFull,
            FULL_REDRAW_AFTER_TYPING_MS,
          );
        })
        .catch(() => {
          if (cancelled) return;
          paintedRevisionRef.current = -1;
          setRetryToken((n) => n + 1);
        });
    } else {
      setRenderError(null);
      paintFull();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(settleTimer);
    };
  }, [
    nearViewport,
    document,
    page.pageIndex,
    page.width,
    page.height,
    deviceScale,
    page.revision,
    retryToken,
  ]);

  // A lifted image: the canvas pixels it covered, put back if the gesture is
  // cancelled, and the revision a committed gesture must move the page past.
  const liftRef = useRef<{
    area: PageRect;
    covered: ImageData;
    revision: number;
  } | null>(null);

  // Paints the page under image `imageId` as it would be without it, so a
  // drag shows only the moving picture. One area render per gesture.
  function liftImage(imageId: string): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const live = document.page(page.pageIndex);
    const image = live.findImage(imageId);
    if (!canvas || !ctx || !image || liftRef.current) return;
    if (!showsWholePage(canvas, live, deviceScale)) return;
    const area = PdfiumPageRenderer.pixelsCovering(
      live,
      deviceScale,
      visibleImageBounds(image),
    );
    if (!area) return;
    const without = PdfiumPageRenderer.renderAreaWithout(
      document,
      live,
      deviceScale,
      area,
      image.pdfiumObjPtr,
    );
    if (!without) return;
    liftRef.current = {
      area,
      covered: ctx.getImageData(area.x, area.y, area.width, area.height),
      revision: live.revision,
    };
    ctx.putImageData(without, area.x, area.y);
  }

  // Ends a lift. Returns true when the page has changed and will repaint;
  // otherwise the image is painted back where it was.
  function settleImage(committed: boolean): boolean {
    const lift = liftRef.current;
    liftRef.current = null;
    if (!lift) return false;
    const repaints =
      committed && document.page(page.pageIndex).revision !== lift.revision;
    if (!repaints)
      canvasRef.current
        ?.getContext("2d")
        ?.putImageData(lift.covered, lift.area.x, lift.area.y);
    return repaints;
  }

  return (
    <Box
      // Fills the viewer's page box and stays transparent until painted, so
      // the viewer's own render shows through.
      pos="absolute"
      ref={containerRef}
      className={privateContentClassName}
      style={{ inset: 0 }}
      data-testid={`pdf-editor-page-${page.pageIndex}`}
      onClick={(e) => {
        if (!onPageClick) return;
        // Convert from CSS pixel coords (origin upper-left) into PDF
        // page-space coords (origin lower-left, points).
        const rect = e.currentTarget.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        // CSS px -> display-PDF.
        const xd = cssX / cssScale;
        const yd = page.height - cssY / cssScale;
        const p = transform.invert(xd, yd);
        onPageClick(page.pageIndex, p.x, p.y);
      }}
    >
      <canvas
        ref={canvasRef}
        // Lets a rebuild sample the scan's own colours off the rendered page.
        data-page-canvas={page.pageIndex}
        style={{
          display: "block",
          width: raster.width,
          height: raster.height,
          transition: "filter 0.25s ease",
          filter: pageFilter,
        }}
      />
      {renderError && (
        <Box
          pos="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,238,238,0.95)",
            color: "#a00",
            gap: 8,
            padding: 16,
            textAlign: "center",
            pointerEvents: "auto",
            zIndex: 10,
          }}
          data-testid={`pdf-editor-page-${page.pageIndex}-error`}
        >
          <span style={{ fontSize: 13 }}>
            {t("pdfTextEditor.pageView.renderFailed", "Failed to render page")}
          </span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{renderError}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            accent="danger"
            onClick={() => setRetryToken((token) => token + 1)}
            data-testid={`pdf-editor-page-${page.pageIndex}-retry`}
          >
            {t("common.retry", "Retry")}
          </Button>
        </Box>
      )}
      <Box
        pos="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        style={{
          pointerEvents: "none",
          transition: "filter 0.25s ease",
          filter: pageFilter,
        }}
      >
        {/* Before the runs: a run overlapping an annotation still wins clicks. */}
        {(page.annotations ?? []).map((annotation) => (
          <AnnotationOutline
            key={annotation.id}
            annotation={annotation}
            pageHeight={page.height}
            transform={transform}
            scale={cssScale}
            selected={annotation.id === selectedFormFieldId}
            onSelect={
              ACCESSIBILITY_EDITING &&
              reviewing &&
              annotation.kind === "widget" &&
              onSelectFormField
                ? () => onSelectFormField(annotation.id)
                : undefined
            }
          />
        ))}
        {/* Before images and runs: anything drawn over a shape wins its clicks. */}
        {page.shapes.map((shape) => (
          <ShapeHandle
            key={shape.id}
            shape={shape}
            pageHeight={page.height}
            transform={transform}
            scale={cssScale}
            selected={selectedShapeIds.includes(shape.id)}
            fixed={reviewing}
            onSelect={(extend) => onSelectShape(shape.id, extend)}
            onMove={(dx, dy) => onMoveShape?.(page.pageIndex, shape.id, dx, dy)}
          />
        ))}
        {page.images.map((image) => (
          <ImageHandle
            key={image.id}
            image={image}
            pageHeight={page.height}
            transform={transform}
            scale={cssScale}
            selected={selectedImageIds.includes(image.id)}
            fixed={reviewing}
            onSelect={() => onSelectImage(image.id)}
            onTransformCommit={(next) =>
              onTransformImage?.(page.pageIndex, image.id, next)
            }
            attention={attention.images.get(image.id) ?? null}
            readPixels={() =>
              readShownImagePixels(store, page.pageIndex, image.id)
            }
            onLift={() => liftImage(image.id)}
            onSettle={settleImage}
            pageRevision={paintedRevision}
          />
        ))}
        {/* Grid + empty-cell editors sit below the run overlays so filled
            cells are edited through their own run. */}
        {!reviewing && (
          <TableOverlay
            page={page}
            transform={transform}
            scale={cssScale}
            store={store}
            selectedRunIds={selectedRunIds}
          />
        )}
        {/* Every run's move/width grips, after the objects beneath the text and
            before all runs, so a grip never takes a click aimed at any run. */}
        <div ref={setGripLayer} style={{ display: "contents" }} />
        {page.runs.map((run) => (
          <TextRunOverlay
            key={run.id}
            run={run}
            pageHeight={page.height}
            pageWidth={page.width}
            transform={transform}
            scale={cssScale}
            widthMode={widthMode}
            growEdge={runGrowEdges.get(run.id) ?? null}
            pageRevision={paintedRevision}
            gripLayer={reviewing ? null : gripLayer}
            selected={selectedRunIds.includes(run.id)}
            findRange={findMatch?.runId === run.id ? findMatch.range : null}
            readOnly={reviewing}
            onSelect={(shiftKey) => onSelectRun(run.id, shiftKey)}
            onEdit={(nextText) => onEditRun(page.pageIndex, run.id, nextText)}
            onTextRangeChange={(range) => onSelectRunText?.(run.id, range)}
            textRange={
              selectedRunIds.length === 1 && selectedRunIds[0] === run.id
                ? selectedTextRange
                : null
            }
            onMove={
              reviewing
                ? undefined
                : (dx, dy) => onMoveRun?.(page.pageIndex, run.id, dx, dy)
            }
            onWrap={
              reviewing
                ? undefined
                : (maxWidthPt, keepClearBelow) =>
                    onWrapRun?.(
                      page.pageIndex,
                      run.id,
                      maxWidthPt,
                      keepClearBelow,
                    )
            }
            onMeasure={
              onMeasureRun
                ? () => onMeasureRun(page.pageIndex, run.id)
                : undefined
            }
            onResize={
              onResizeRun && !reviewing && canResizeRun(run)
                ? (widthPt) => onResizeRun(page.pageIndex, run.id, widthPt)
                : undefined
            }
          />
        ))}
        {page.runs
          .filter((run) => attention.runs.has(run.id))
          .map((run) => (
            <AttentionBadge
              key={run.id}
              attention="needs-description"
              testId={`pdf-editor-attention-run-${run.id}`}
              style={besideRun(run, transform, page.height, cssScale)}
            />
          ))}
        {showRulers && (
          <PageGuides
            pageIndex={page.pageIndex}
            width={page.width}
            height={page.height}
            scale={cssScale}
            transform={transform}
          />
        )}
      </Box>
    </Box>
  );
});

/** Just past the top-right corner of a run's box, in page pixels. */
function besideRun(
  run: TextRunSnapshot,
  transform: DisplayTransform,
  pageHeight: number,
  scale: number,
): CSSProperties {
  const { x, y, width, height } = run.bounds;
  const corners = [
    transform.apply(x, y),
    transform.apply(x + width, y + height),
  ];
  const right = Math.max(...corners.map((c) => c.x));
  const top = Math.max(...corners.map((c) => c.y));
  return { left: right * scale + 4, top: (pageHeight - top) * scale };
}

// Long enough a typing pause to draw the page whole, repairing anything a partial redraw missed.
const FULL_REDRAW_AFTER_TYPING_MS = 400;

// The canvas pixels to redraw over a bitmap painted at revision `painted`, or null to draw the whole page.
function changedPixels(
  page: Page,
  scale: number,
  canvas: HTMLCanvasElement,
  painted: number,
): PageRect | null {
  if (!showsWholePage(canvas, page, scale)) return null;
  const raw = page.repaintAreaSince(painted);
  return raw && PdfiumPageRenderer.pixelsCovering(page, scale, raw);
}

function showsWholePage(
  canvas: HTMLCanvasElement,
  page: Page,
  scale: number,
): boolean {
  const full = PdfiumPageRenderer.rasterSize(page.width, page.height, scale);
  return canvas.width === full.width && canvas.height === full.height;
}
