/**
 * ButtonAppearanceOverlay — Renders PDF push-button widget appearances as
 * canvas bitmaps on top of a PDF page.
 *
 * This is a visual-only layer (pointerEvents: none). Click handling is done
 * separately by FormFieldOverlay's transparent hit-target divs.
 *
 * Uses the same EPDF_RenderAnnotBitmap / FPDF_FFLDraw pipeline as
 * SignatureFieldOverlay to produce the button's native PDF appearance.
 */
import { useStaleBakedFieldNames } from "@app/tools/formFill/FormFillContext";
import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  renderButtonFieldAppearances,
  type SignatureFieldAppearance,
} from "@app/services/pdfiumService";
import { getDocumentBytes } from "@app/services/documentBytesCache";
import { documentHasFormFieldsFor } from "@app/services/documentFormProbe";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";

interface ButtonAppearanceOverlayProps {
  pageIndex: number;
  pdfSource: File | Blob | null;
  pageWidth: number;
  pageHeight: number;
}
let _cachedSource: File | Blob | null = null;
const _pageCache = new Map<number, Promise<SignatureFieldAppearance[]>>();

/**
 * Per-page button appearances, cached by source identity: a new source clears
 * every page, and each page renders only its own widget bitmaps.
 */
function resolveButtonAppearances(
  source: File | Blob,
  pageIndex: number,
): Promise<SignatureFieldAppearance[]> {
  if (source !== _cachedSource) {
    _cachedSource = source;
    _pageCache.clear();
  }
  const cached = _pageCache.get(pageIndex);
  if (cached) return cached;

  const pending = (async () => {
    if (!(await documentHasFormFieldsFor(source))) return [];
    const buf = await getDocumentBytes(source);
    return runPdfiumScan(() =>
      renderButtonFieldAppearances(buf, undefined, [pageIndex]),
    );
  })();
  _pageCache.set(pageIndex, pending);
  return pending;
}
function ButtonBitmapCanvas({
  imageData,
  cssWidth,
  cssHeight,
}: {
  imageData: ImageData;
  cssWidth: number;
  cssHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: cssWidth, height: cssHeight, display: "block" }}
    />
  );
}
function ButtonAppearanceOverlayInner({
  pageIndex,
  pdfSource,
  pageWidth,
  pageHeight,
}: ButtonAppearanceOverlayProps) {
  const staleNames = useStaleBakedFieldNames();
  const [appearances, setAppearances] = useState<SignatureFieldAppearance[]>(
    [],
  );

  useEffect(() => {
    if (!pdfSource) {
      setAppearances([]);
      return;
    }
    let cancelled = false;
    resolveButtonAppearances(pdfSource, pageIndex)
      .then((res) => {
        if (!cancelled) setAppearances(res);
      })
      .catch(() => {
        if (!cancelled) setAppearances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfSource, pageIndex]);

  const pageAppearances = useMemo(
    () => appearances.filter((a) => a.imageData !== null),
    [appearances],
  );

  if (pageAppearances.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 4,
      }}
      data-button-appearance-page={pageIndex}
    >
      {pageAppearances
        .filter((btn) => !staleNames.has(btn.fieldName))
        .map((btn, idx) => {
          const sx =
            btn.sourcePageWidth > 0 ? pageWidth / btn.sourcePageWidth : 1;
          const sy =
            btn.sourcePageHeight > 0 ? pageHeight / btn.sourcePageHeight : 1;
          const left = btn.x * sx;
          const top = btn.y * sy;
          const width = btn.width * sx;
          const height = btn.height * sy;

          return (
            <div
              key={`btn-appearance-${btn.fieldName}-${idx}`}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "hidden",
              }}
            >
              <ButtonBitmapCanvas
                imageData={btn.imageData!}
                cssWidth={width}
                cssHeight={height}
              />
            </div>
          );
        })}
    </div>
  );
}

export const ButtonAppearanceOverlay = memo(ButtonAppearanceOverlayInner);
