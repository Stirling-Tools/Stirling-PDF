import { useTranslation } from "react-i18next";
import type { AnnotationBox } from "@app/tools/pdfTextEditor/v2/model/AnnotationBox";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import "@app/tools/pdfTextEditor/v2/components/AnnotationOutline.css";

interface AnnotationOutlineProps {
  annotation: AnnotationBox;
  pageHeight: number;
  transform: DisplayTransform;
  scale: number;
}

// FreeText/widget/stamp text is painted by FPDF_ANNOT but lives outside the
// page-object tree the editor walks, so it is visible and not editable. Outline
// it and say so rather than leaving the user to wonder why clicking does
// nothing.
export function AnnotationOutline({
  annotation,
  pageHeight,
  transform,
  scale,
}: AnnotationOutlineProps) {
  const { t } = useTranslation();
  const { rect, kind } = annotation;

  // Raw-PDF AABB -> display-PDF space -> CSS px. All FOUR corners go through
  // the transform: on a /Rotate page two corners give the wrong box.
  const corners = [
    transform.apply(rect.x, rect.y),
    transform.apply(rect.x + rect.width, rect.y),
    transform.apply(rect.x, rect.y + rect.height),
    transform.apply(rect.x + rect.width, rect.y + rect.height),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const left = minX * scale;
  const top = (pageHeight - maxY) * scale;
  const width = (maxX - minX) * scale;
  const height = (maxY - minY) * scale;
  if (!(width > 1 && height > 1)) return null;

  const label =
    kind === "widget"
      ? t(
          "pdfTextEditorV2.annotations.widget",
          "Form field - not page text, so it can't be edited here",
        )
      : kind === "freetext"
        ? t(
            "pdfTextEditorV2.annotations.freetext",
            "Annotation text - not page text, so it can't be edited here",
          )
        : t(
            "pdfTextEditorV2.annotations.stamp",
            "Stamp annotation - not page text, so it can't be edited here",
          );

  return (
    <div
      className="v2-annotation-outline"
      data-testid={`v2-annot-${annotation.id}`}
      data-annot-kind={kind}
      title={label}
      aria-label={label}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        // Hoverable so the tooltip explains itself. PageView draws these
        // BEFORE the text runs, so a run overlapping this box still wins the
        // click and stays editable.
        pointerEvents: "auto",
      }}
    />
  );
}
