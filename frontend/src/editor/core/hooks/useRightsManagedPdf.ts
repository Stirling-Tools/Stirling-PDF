import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getOpenedRightsManagedPdf,
  getRightsManagedThumbnail,
  isMicrosoftProtectedPdf,
  protectLikeOriginal,
  rightsManagedPdfRevision,
  subscribeRightsManagedPdfs,
  type OpenedRightsManagedPdf,
} from "@editor/services/rightsManagedPdf";

export type RightsManagedPdfState =
  | { status: "checking" }
  | { status: "none" }
  | { status: "locked" }
  | { status: "opened"; opened: OpenedRightsManagedPdf };

export function useRightsManagedPdfRevision(): number {
  return useSyncExternalStore(
    subscribeRightsManagedPdfs,
    rightsManagedPdfRevision,
    rightsManagedPdfRevision,
  );
}

export function useRightsManagedPdf(
  file: File | null | undefined,
): RightsManagedPdfState {
  useRightsManagedPdfRevision();
  const [detected, setDetected] = useState<{
    file: File;
    isProtected: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void isMicrosoftProtectedPdf(file).then((isProtected) => {
      if (!cancelled) setDetected({ file, isProtected });
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return { status: "none" };
  const opened = getOpenedRightsManagedPdf(file);
  if (opened) return { status: "opened", opened };
  if (detected?.file !== file) return { status: "checking" };
  return detected.isProtected ? { status: "locked" } : { status: "none" };
}

export function useRightsManagedThumbnail(
  file: Blob | string | null | undefined,
): string | undefined {
  useRightsManagedPdfRevision();
  return getRightsManagedThumbnail(file);
}

export interface RightsManagedExport {
  protectFile: (plain: File) => Promise<File>;
  protectBytes: (bytes: ArrayBuffer) => Promise<ArrayBuffer>;
}

export function useRightsManagedExport(
  opened: OpenedRightsManagedPdf | null,
): RightsManagedExport | undefined {
  return useMemo(() => {
    if (!opened) return undefined;
    const protectFile = (plain: File) => protectLikeOriginal(opened, plain);
    return {
      protectFile,
      protectBytes: async (bytes: ArrayBuffer) =>
        (
          await protectFile(
            new File([bytes], opened.original.name, {
              type: "application/pdf",
            }),
          )
        ).arrayBuffer(),
    };
  }, [opened]);
}
