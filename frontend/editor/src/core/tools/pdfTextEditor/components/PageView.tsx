import { useEffect, useRef, useState } from "react";
import { Box, Loader } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";
import { TextRunOverlay } from "@app/tools/pdfTextEditor/components/TextRunOverlay";
import { TableOverlay } from "@app/tools/pdfTextEditor/components/TableOverlay";
import { ImageHandle } from "@app/tools/pdfTextEditor/components/ImageHandle";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { AnnotationOutline } from "@app/tools/pdfTextEditor/components/AnnotationOutline";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import { PageGuides } from "@app/tools/pdfTextEditor/components/PageRulers";
import { useDevicePixelRatio } from "@app/tools/pdfTextEditor/hooks/useDevicePixelRatio";

interface PageViewProps {
  document: EditorDocument;
  /** Store, for the table overlay's dispatch/selection. */
  store: EditorStore;
  page: PageSnapshot;
  /** Fires when the page enters the viewport for the first time. */
  onFirstVisible?: (pageIndex: number) => void;
  /** Fires when the page's bitmap finishes its first render. */
  onFirstRendered?: (pageIndex: number) => void;
  scale: number;
  widthMode: import("@app/tools/pdfTextEditor/types").WidthMode;
  /** Show the page rulers and alignment guides. */
  showRulers?: boolean;
  selectedRunIds: string[];
  selectedImageIds: string[];
  /** Run id currently highlighted by the find-bar (yellow). */
  highlightedRunId?: string | null;
  onSelectRun: (runId: string, shiftKey: boolean) => void;
  onSelectImage: (imageId: string) => void;
  onEditRun: (pageIndex: number, runId: string, nextText: string) => void;
  /** Ctrl+drag committed; dx/dy in PDF points. */
  onMoveRun?: (
    pageIndex: number,
    runId: string,
    dx: number,
    dy: number,
  ) => void;
  /** Wrap-mode reflow request; maxWidthPt in PDF points. */
  onWrapRun?: (pageIndex: number, runId: string, maxWidthPt: number) => void;
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

// One PDF page: a PDFium-rendered bitmap plus an HTML overlay layer with one
// positioned, editable element per text run.
export function PageView({
  document,
  store,
  page,
  scale,
  widthMode,
  showRulers,
  selectedRunIds,
  selectedImageIds,
  highlightedRunId,
  onSelectRun,
  onSelectImage,
  onEditRun,
  onMoveRun,
  onWrapRun,
  onPageClick,
  onTransformImage,
  onFirstVisible,
  onFirstRendered,
}: PageViewProps) {
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
  const visibleFiredRef = useRef(false);
  const firstRenderFiredRef = useRef(false);
  const [rendering, setRendering] = useState(false);
  const [paintedRevision, setPaintedRevision] = useState(-1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // True when this page is within ~one viewport of the visible area.
  const [nearViewport, setNearViewport] = useState(false);

  // First-visible: lazy-populate the page's runs/images.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onFirstVisible) return;
    if (visibleFiredRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !visibleFiredRef.current) {
            visibleFiredRef.current = true;
            onFirstVisible(page.pageIndex);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [page.pageIndex, onFirstVisible]);

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
    if (!canvas) return;
    setRendering(true);
    setRenderError(null);
    PdfiumPageRenderer.render(
      document,
      document.page(page.pageIndex),
      deviceScale,
    )
      .then((image) => {
        if (cancelled || !canvasRef.current) return;
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.putImageData(image, 0, 0);
        setRendering(false);
        setPaintedRevision(page.revision);
        if (!firstRenderFiredRef.current) {
          firstRenderFiredRef.current = true;
          onFirstRendered?.(page.pageIndex);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.warn(`[pdf-editor] page ${page.pageIndex} render failed`, err);
        setRendering(false);
        setRenderError(msg);
        // Flip the first-rendered flag on error too, so the loading
        // overlay dismisses instead of leaving the user on a spinner.
        if (!firstRenderFiredRef.current) {
          firstRenderFiredRef.current = true;
          onFirstRendered?.(page.pageIndex);
        }
      });
    return () => {
      cancelled = true;
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

  return (
    <Box
      pos="relative"
      mx="auto"
      mb="lg"
      ref={containerRef}
      style={{
        width: raster.width,
        height: raster.height,
        boxShadow: "0 0 4px rgba(0,0,0,0.2)",
        background: "#fff",
      }}
      data-testid={`pdf-editor-page-${page.pageIndex}`}
      onClick={(e) => {
        if (!onPageClick) return;
        // Convert from CSS pixel coords (origin upper-left) into PDF
        // page-space coords (origin lower-left, points).
        const rect = (
          e.currentTarget as HTMLDivElement
        ).getBoundingClientRect();
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
        }}
      />
      {!nearViewport && (
        <Box
          pos="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "repeating-linear-gradient(45deg, #fafafa, #fafafa 8px, #f0f0f0 8px, #f0f0f0 16px)",
            color: "#777",
            fontSize: 13,
            pointerEvents: "none",
          }}
          data-testid={`pdf-editor-page-${page.pageIndex}-placeholder`}
        >
          Page {page.pageIndex + 1}
        </Box>
      )}
      {rendering && nearViewport && (
        <Box pos="absolute" top={8} right={8} style={{ pointerEvents: "none" }}>
          <Loader size="xs" />
        </Box>
      )}
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
          <span style={{ fontSize: 13 }}>Failed to render page</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{renderError}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            accent="danger"
            onClick={() => setRetryToken((t) => t + 1)}
            data-testid={`pdf-editor-page-${page.pageIndex}-retry`}
          >
            Retry
          </Button>
        </Box>
      )}
      <Box
        pos="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        style={{ pointerEvents: "none" }}
      >
        {/* Before the runs: a run overlapping an annotation still wins clicks. */}
        {(page.annotations ?? []).map((annotation) => (
          <AnnotationOutline
            key={annotation.id}
            annotation={annotation}
            pageHeight={page.height}
            transform={transform}
            scale={cssScale}
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
            onSelect={() => onSelectImage(image.id)}
            onTransformCommit={(next) =>
              onTransformImage?.(page.pageIndex, image.id, next)
            }
          />
        ))}
        {/* Grid + empty-cell editors sit below the run overlays so filled
            cells are edited through their own run. */}
        <TableOverlay
          page={page}
          transform={transform}
          scale={cssScale}
          store={store}
        />
        {page.runs.map((run) => (
          <TextRunOverlay
            key={run.id}
            run={run}
            pageHeight={page.height}
            pageWidth={page.width}
            transform={transform}
            scale={cssScale}
            widthMode={widthMode}
            pageRevision={paintedRevision}
            selected={selectedRunIds.includes(run.id)}
            highlighted={highlightedRunId === run.id}
            onSelect={(shiftKey) => onSelectRun(run.id, shiftKey)}
            onEdit={(nextText) => onEditRun(page.pageIndex, run.id, nextText)}
            onMove={(dx, dy) => onMoveRun?.(page.pageIndex, run.id, dx, dy)}
            onWrap={(maxWidthPt) =>
              onWrapRun?.(page.pageIndex, run.id, maxWidthPt)
            }
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
}
