import { useCallback, useRef, useState } from "react";
import { pdfWorkerManager } from "@editor/services/pdfWorkerManager";

const INVISIBLE_FLAG = 0x01;
const HIDDEN_FLAG = 0x02;
const NO_VIEW_FLAG = 0x20;

export interface SignatureAnnotation {
  subtype?: string;
  fieldType?: string;
  hasAppearance?: boolean;
  annotationFlags?: number;
  rect?: number[];
}

export function isVisibleSignatureStamp(
  annotation: SignatureAnnotation,
): boolean {
  if (annotation.subtype !== "Widget" || annotation.fieldType !== "Sig") {
    return false;
  }
  if (!annotation.hasAppearance) return false;
  const flags = annotation.annotationFlags ?? 0;
  if (flags & (INVISIBLE_FLAG | HIDDEN_FLAG | NO_VIEW_FLAG)) return false;
  const [x1, y1, x2, y2] = annotation.rect ?? [0, 0, 0, 0];
  return Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0;
}

export async function hasVisibleSignatureStamp(file: Blob): Promise<boolean> {
  const pdf = await pdfWorkerManager.createDocument(await file.arrayBuffer());
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const annotations: SignatureAnnotation[] = await page.getAnnotations();
      if (annotations.some(isVisibleSignatureStamp)) return true;
    }
    return false;
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
}

export function useKeptSignatureStamp() {
  const [stampKept, setStampKept] = useState(false);
  const latestRun = useRef(0);

  const recordRun = useCallback(
    (files: readonly Blob[], removeVisibleSignature: boolean) => {
      const run = ++latestRun.current;
      setStampKept(false);
      if (removeVisibleSignature) return;
      void Promise.all(
        files.map((file) => hasVisibleSignatureStamp(file).catch(() => false)),
      ).then((found) => {
        if (run === latestRun.current) setStampKept(found.some(Boolean));
      });
    },
    [],
  );

  return { stampKept, recordRun };
}
