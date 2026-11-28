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
import { useStaleBakedFieldNames } from "@editor/tools/formFill/FormFillContext";
import { getDocumentBytes } from "@editor/services/documentBytesCache";
import { documentHasFormFields } from "@editor/services/documentFormProbe";
import { runPdfiumScan } from "@editor/services/pdfiumScanQueue";
import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { useSignatureFieldPicker } from "@editor/contexts/SignatureFieldPickerContext";
import { isStirlingFile } from "@editor/types/fileContext";
import "@editor/components/viewer/SignatureFieldOverlay.css";
import {
  renderSignatureFieldAppearances,
  extractSignatures,
  type PdfiumSignature,
  type SignatureFieldAppearance,
} from "@editor/services/pdfiumService";

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
  /** The page bitmap already draws the appearance, so painting it again would double it. */
  appearanceInBitmap?: boolean;
  /** CSS filter matching the page render mode (dark, sepia). */
  renderFilter?: string;
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

function hasSignatureValue(signature: PdfiumSignature | undefined): boolean {
  return (signature?.contents.length ?? 0) > 0;
}

async function resolveFields(
  source: File | Blob,
): Promise<ResolvedSignatureField[]> {
  if (source === _cachedSource && _cachePromise) return _cachePromise;
  _cachedSource = source;

  _cachePromise = (async () => {
    const buf = await getDocumentBytes(source);
    if (!(await documentHasFormFields(buf, source.size))) return [];
    // One main-thread scan at a time, so a second full document copy cannot
    // be opened while this one runs.
    const appearances = await runPdfiumScan(() =>
      renderSignatureFieldAppearances(buf),
    );
    const signatures = await runPdfiumScan(() => extractSignatures(buf));

    // PDFium does not say which field a signature belongs to, so reason and time are matched
    // by position only when the signed fields and the signatures line up one to one.
    const signedFields = appearances.filter((f) => f.signed);
    const values = signatures.filter(hasSignatureValue);
    const paired = signedFields.length === values.length;
    return appearances.map((f) => {
      const matchedSig = paired ? values[signedFields.indexOf(f)] : undefined;
      return {
        ...f,
        isSigned: f.signed,
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
  appearanceInBitmap = false,
  renderFilter,
}: SignatureFieldOverlayProps) {
  const { t } = useTranslation();
  const staleNames = useStaleBakedFieldNames();
  const { pick } = useSignatureFieldPicker();
  const sourceFileId =
    pdfSource && isStirlingFile(pdfSource) ? pdfSource.fileId : null;
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
    // A staged move or delete leaves this bitmap stranded at the original rect, on top of the
    // editor chrome, so it is dropped until the edit is applied and the appearance re-extracted.
    () =>
      fields.filter(
        (f) => f.pageIndex === pageIndex && !staleNames.has(f.fieldName),
      ),
    [fields, pageIndex, staleNames],
  );

  if (pageFields.length === 0) return null;

  const getSignedTitle = (field: ResolvedSignatureField) => {
    const label = field.reason
      ? t("viewer.signatureField.signedWithReason", "Signed: {{reason}}", {
          reason: field.reason,
        })
      : t("viewer.signatureField.signed", "Signed");
    if (!field.time) return label;
    return t("viewer.signatureField.withTime", "{{label}} ({{time}})", {
      label,
      time: field.time,
    });
  };

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
        filter: renderFilter,
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
        const pickable =
          !field.isSigned &&
          pick?.fileId === sourceFileId &&
          pick.fieldNames.has(field.fieldName);
        const chosen = pickable && pick?.selected === field.fieldName;
        const pickProps = pickable
          ? {
              role: "button",
              tabIndex: 0,
              "aria-pressed": chosen,
              onClick: () => pick?.choose(field.fieldName),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  pick?.choose(field.fieldName);
                }
              },
              title: t(
                "viewer.signatureField.signHere",
                "Sign here: {{name}}",
                { name: field.fieldName },
              ),
            }
          : {};
        const pickStyle: React.CSSProperties = pickable
          ? {
              cursor: "pointer",
              border: chosen
                ? "2px solid var(--c-primary)"
                : "2px dashed var(--c-primary)",
              background: chosen
                ? "white"
                : "color-mix(in srgb, var(--c-primary) 6%, transparent)",
              boxShadow: chosen
                ? "0 0 0 4px color-mix(in srgb, var(--c-primary) 25%, transparent)"
                : undefined,
            }
          : {};
        if (chosen && pick?.preview) {
          return (
            <div
              key={`sig-${field.fieldName}-${idx}-${pick.flash}`}
              data-signature-field-chosen
              className="signature-field-flash"
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "hidden",
                pointerEvents: "auto",
                borderRadius: 4,
                ...pickStyle,
              }}
              {...pickProps}
            >
              <img
                src={pick.preview}
                alt=""
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
          );
        }

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
                ...pickStyle,
              }}
              {...pickProps}
              title={
                pickable
                  ? pickProps.title
                  : field.isSigned
                    ? getSignedTitle(field)
                    : t(
                        "viewer.signatureField.fieldTitle",
                        "Signature field: {{name}}",
                        { name: field.fieldName },
                      )
              }
            >
              {!appearanceInBitmap && (
                <SignatureBitmapCanvas
                  imageData={field.imageData}
                  cssWidth={width}
                  cssHeight={height}
                />
              )}
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
              ...pickStyle,
            }}
            {...pickProps}
            title={
              pickable
                ? pickProps.title
                : field.isSigned
                  ? getSignedTitle(field)
                  : t(
                      "viewer.signatureField.unsignedFieldTitle",
                      "Unsigned signature field: {{name}}",
                      { name: field.fieldName },
                    )
            }
          >
            <span
              style={{
                fontSize: Math.min(height * 0.35, 14),
                color: field.isSigned
                  ? "rgba(34, 139, 34, 0.85)"
                  : pickable
                    ? "var(--c-accent-fg, var(--c-primary))"
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
              {field.isSigned
                ? `🔒 ${t("viewer.signatureField.signed", "Signed")}`
                : pickable
                  ? t("viewer.signatureField.clickToSign", "Click to sign here")
                  : `✎ ${t("viewer.signatureField.badge", "Signature")}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SignatureFieldOverlay = memo(SignatureFieldOverlayInner);
export default SignatureFieldOverlay;
