import { useEffect, useRef } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  type PdfAnnotationObject,
} from "@embedpdf/models";
import {
  useSignature,
  type PlacedSignature,
} from "@app/contexts/SignatureContext";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

const SIGNATURE_SUBJECT_PREFIXES = ["Digital Signature", "Text Signature"];

function isSignatureStamp(annotation: PdfAnnotationObject): boolean {
  return (
    annotation.type === PdfAnnotationSubtype.STAMP &&
    SIGNATURE_SUBJECT_PREFIXES.some((prefix) =>
      (annotation.subject ?? "").startsWith(prefix),
    )
  );
}

export function nextPlacedSignatures(
  placed: PlacedSignature[],
  event: AnnotationEvent,
  imageFor: (annotationId: string) => string | undefined,
): PlacedSignature[] {
  if (event.type === "loaded") return [];
  if (event.type === "delete") {
    return placed.filter((entry) => entry.id !== event.annotation.id);
  }
  if (event.type !== "create" || !isSignatureStamp(event.annotation))
    return placed;
  const { id } = event.annotation;
  if (placed.some((entry) => entry.id === id)) return placed;
  return [
    ...placed,
    { id, pageIndex: event.pageIndex, imageSrc: imageFor(id) },
  ];
}

export function usePlacedSignatureTracking() {
  const { provides: annotationApi } = useAnnotationCapability();
  const { setPlacedSignatures, getImageData } = useSignature();
  const documentReady = useDocumentReady();
  const placedRef = useRef<PlacedSignature[]>([]);

  useEffect(() => {
    if (!annotationApi?.onAnnotationEvent || !documentReady) return;
    return annotationApi.onAnnotationEvent((event) => {
      const next = nextPlacedSignatures(placedRef.current, event, getImageData);
      if (next === placedRef.current) return;
      placedRef.current = next;
      setPlacedSignatures(next);
    });
  }, [annotationApi, documentReady, getImageData, setPlacedSignatures]);
}
