import { useEffect, useRef, useState } from "react";
import { Box, Loader } from "@mantine/core";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";
import { TextRunOverlay } from "@app/tools/pdfTextEditor/v2/components/TextRunOverlay";
import { ImageHandle } from "@app/tools/pdfTextEditor/v2/components/ImageHandle";

interface PageViewProps {
  document: EditorDocument;
  page: PageSnapshot;
  /** Fires when the page enters the viewport for the first time. */
  onFirstVisible?: (pageIndex: number) => void;
  /** Fires when the page's bitmap finishes its first render. */
  onFirstRendered?: (pageIndex: number) => void;
  scale: number;
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
  /** Fires when the user clicks on a non-text area of the page. */
  onPageClick?: (pageIndex: number, pageX: number, pageY: number) => void;
  /**
   * Fires when an image's drag OR resize completes. The bounds are
   * absolute PDF page-space coords (origin lower-left).
   */
  onTransformImage?: (
    pageIndex: number,
    imageId: string,
    next: { x: number; y: number; width: number; height: number },
  ) => void;
}

/**
 * One PDF page: a PDFium-rendered bitmap plus an HTML overlay layer
 * with one positioned, editable element per text run.
 */
export function PageView({
  document,
  page,
  scale,
  selectedRunIds,
  selectedImageIds,
  highlightedRunId,
  onSelectRun,
  onSelectImage,
  onEditRun,
  onMoveRun,
  onPageClick,
  onTransformImage,
  onFirstVisible,
  onFirstRendered,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibleFiredRef = useRef(false);
  const firstRenderFiredRef = useRef(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // True when this page is within ~one viewport of the visible area.
  // Rendering only starts when this flips, so an 80-page doc doesn't
  // fire 80 concurrent PDFium renders into the same WASM heap.
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

  // Near-viewport observer triggers the render with a wide rootMargin
  // so the bitmap is ready before the page enters the viewport.
  // Out-of-view pages keep their rendered canvas for instant re-entry.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setNearViewport(true);
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);
    setRenderError(null);
    PdfiumPageRenderer.render(document, document.page(page.pageIndex), scale)
      .then((image) => {
        if (cancelled || !canvasRef.current) return;
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.style.width = `${page.width * scale}px`;
        canvas.style.height = `${page.height * scale}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.putImageData(image, 0, 0);
        setRendering(false);
        if (!firstRenderFiredRef.current) {
          firstRenderFiredRef.current = true;
          onFirstRendered?.(page.pageIndex);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err);
        console.warn(
          `[v2] page ${page.pageIndex} render failed`,
          err,
        );
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
    scale,
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
        width: page.width * scale,
        height: page.height * scale,
        boxShadow: "0 0 4px rgba(0,0,0,0.2)",
        background: "#fff",
      }}
      data-testid={`v2-page-${page.pageIndex}`}
      onClick={(e) => {
        if (!onPageClick) return;
        // Convert from CSS pixel coords (origin upper-left) into PDF
        // page-space coords (origin lower-left, points).
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const pageX = cssX / scale;
        const pageY = page.height - cssY / scale;
        onPageClick(page.pageIndex, pageX, pageY);
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
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
          data-testid={`v2-page-${page.pageIndex}-placeholder`}
        >
          Page {page.pageIndex + 1}
        </Box>
      )}
      {rendering && nearViewport && (
        <Box
          pos="absolute"
          top={8}
          right={8}
          style={{ pointerEvents: "none" }}
        >
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
          data-testid={`v2-page-${page.pageIndex}-error`}
        >
          <span style={{ fontSize: 13 }}>Failed to render page</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{renderError}</span>
          <button
            type="button"
            onClick={() => setRetryToken((t) => t + 1)}
            style={{
              border: "1px solid #a00",
              background: "#fff",
              color: "#a00",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
            data-testid={`v2-page-${page.pageIndex}-retry`}
          >
            Retry
          </button>
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
        {page.images.map((image) => (
          <ImageHandle
            key={image.id}
            image={image}
            pageHeight={page.height}
            scale={scale}
            selected={selectedImageIds.includes(image.id)}
            onSelect={() => onSelectImage(image.id)}
            onTransformCommit={(next) =>
              onTransformImage?.(page.pageIndex, image.id, next)
            }
          />
        ))}
        {page.runs.map((run) => (
          <TextRunOverlay
            key={run.id}
            run={run}
            pageHeight={page.height}
            scale={scale}
            selected={selectedRunIds.includes(run.id)}
            highlighted={highlightedRunId === run.id}
            onSelect={(shiftKey) => onSelectRun(run.id, shiftKey)}
            onEdit={(nextText) => onEditRun(page.pageIndex, run.id, nextText)}
            onMove={(dx, dy) => onMoveRun?.(page.pageIndex, run.id, dx, dy)}
          />
        ))}
      </Box>
    </Box>
  );
}
