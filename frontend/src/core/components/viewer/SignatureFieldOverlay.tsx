/**
 * SignatureFieldOverlay — Renders digital-signature form fields on top of a
 * PDF page.
 *
 * When a signature widget has an appearance stream (i.e. a visible graphic
 * embedded by the signing tool), we render it via `EPDF_RenderAnnotBitmap`
 * (an @embedpdf PDFium WASM extension) and paint the result into a `<canvas>`
 * positioned at the correct overlay location.  This is the same rendering
 * path the engine itself uses for individual annotation bitmaps.
 *
 * For widgets without an appearance stream (unsigned fields, or fields whose
 * PDF writer didn't embed one), we fall back to a translucent badge overlay.
 */
import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  renderSignatureFieldAppearances,
  extractSignatures,
  type SignatureFieldAppearance,
} from "@app/services/pdfiumService";

interface SignatureFieldOverlayProps {
  pageIndex: number;
  /** URL or File for the current PDF — used to extract signature data. */
  pdfSource: File | Blob | null;
  /** Document ID from EmbedPDF (kept for caller compatibility). */
  documentId: string;
  /** Rendered page width from Scroller (pixel space). */
  pageWidth: number;
  /** Rendered page height from Scroller (pixel space). */
  pageHeight: number;
}

interface ResolvedSignatureField extends SignatureFieldAppearance {
  /** Whether a cryptographic signature was found for this field. */
  isSigned: boolean;
  /** Signer reason string (if available). */
  reason?: string;
  /** Signing time string (if available). */
  time?: string;
}
let _cachedSource: File | Blob | null = null;
let _cachedFields: ResolvedSignatureField[] = [];
let _cachePromise: Promise<ResolvedSignatureField[]> | null = null;

async function resolveFields(
  source: File | Blob,
): Promise<ResolvedSignatureField[]> {
  if (source === _cachedSource && _cachePromise) return _cachePromise;
  _cachedSource = source;

  _cachePromise = (async () => {
    const buf = await source.arrayBuffer();
    const [appearances, signatures] = await Promise.all([
      renderSignatureFieldAppearances(buf),
      extractSignatures(buf),
    ]);

    return appearances.map((f, i) => {
      // Positional correlation is only reliable when both arrays have the same
      // length — i.e. one signature object per signature field in document order.
      // When the counts differ we cannot safely attribute reason/time per-field,
      // so we fall back to a whole-document "is signed" indicator.
      const exactMatch = appearances.length === signatures.length;
      const matchedSig = exactMatch ? signatures[i] : undefined;
      return {
        ...f,
        isSigned: exactMatch ? i < signatures.length : signatures.length > 0,
        reason: matchedSig?.reason,
        time: matchedSig?.time,
      };
    });
  })();

  _cachedFields = await _cachePromise;
  return _cachedFields;
}

function SignatureBitmapCanvas({
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
      style={{
        width: cssWidth,
        height: cssHeight,
        display: "block",
      }}
    />
  );
}

function SignatureFieldOverlayInner({
  pageIndex,
  pdfSource,
  documentId: _documentId,
  pageWidth,
  pageHeight,
}: SignatureFieldOverlayProps) {
  const [fields, setFields] = useState<ResolvedSignatureField[]>([]);

  useEffect(() => {
    if (!pdfSource) {
      setFields([]);
      return;
    }
    let cancelled = false;
    resolveFields(pdfSource)
      .then((res) => {
        if (!cancelled) setFields(res);
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfSource]);

  const pageFields = useMemo(
    () => fields.filter((f) => f.pageIndex === pageIndex),
    [fields, pageIndex],
  );

  if (pageFields.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 6,
      }}
      data-signature-overlay-page={pageIndex}
    >
      {pageFields.map((field, idx) => {
        // Use the source PDF page dimensions that the extraction used for
        // coordinate computation. This avoids mismatches with pdfPage.size
        // from EmbedPDF which may report different dimensions.
        const sx =
          field.sourcePageWidth > 0 ? pageWidth / field.sourcePageWidth : 1;
        const sy =
          field.sourcePageHeight > 0 ? pageHeight / field.sourcePageHeight : 1;
        const left = field.x * sx;
        const top = field.y * sy;
        const width = field.width * sx;
        const height = field.height * sy;

        // If we have a rendered appearance bitmap, paint it via <canvas>.
        if (field.imageData) {
          return (
            <div
              key={`sig-${field.fieldName}-${idx}`}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "hidden",
                pointerEvents: "auto",
                cursor: "default",
              }}
              title={
                field.isSigned
                  ? `Signed${field.reason ? `: ${field.reason}` : ""}${field.time ? ` (${field.time})` : ""}`
                  : `Signature field: ${field.fieldName}`
              }
            >
              <SignatureBitmapCanvas
                imageData={field.imageData}
                cssWidth={width}
                cssHeight={height}
              />
            </div>
          );
        }

        // Fallback: translucent badge for fields without an appearance.
        return (
          <div
            key={`sig-${field.fieldName}-${idx}`}
            style={{
              position: "absolute",
              left,
              top,
              width,
              height,
              border: field.isSigned
                ? "2px solid rgba(34, 139, 34, 0.7)"
                : "2px dashed rgba(180, 180, 180, 0.7)",
              borderRadius: 4,
              background: field.isSigned
                ? "rgba(34, 139, 34, 0.08)"
                : "rgba(200, 200, 200, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              pointerEvents: "auto",
              cursor: "default",
            }}
            title={
              field.isSigned
                ? `Signed${field.reason ? `: ${field.reason}` : ""}${field.time ? ` (${field.time})` : ""}`
                : `Unsigned signature field: ${field.fieldName}`
            }
          >
            <span
              style={{
                fontSize: Math.min(height * 0.35, 14),
                color: field.isSigned
                  ? "rgba(34, 139, 34, 0.85)"
                  : "rgba(120, 120, 120, 0.85)",
                fontWeight: 600,
                textAlign: "center",
                lineHeight: 1.2,
                padding: "2px 4px",
                userSelect: "none",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              {field.isSigned ? "🔒 Signed" : "✎ Signature"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SignatureFieldOverlay = memo(SignatureFieldOverlayInner);
export default SignatureFieldOverlay;
