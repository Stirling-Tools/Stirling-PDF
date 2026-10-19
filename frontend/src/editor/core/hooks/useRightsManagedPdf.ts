import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getOpenedRightsManagedPdf,
  isMicrosoftProtectedPdf,
  rightsManagedPdfRevision,
  subscribeRightsManagedPdfs,
  type OpenedRightsManagedPdf,
} from "@editor/services/rightsManagedPdf";

export type RightsManagedPdfState =
  | { status: "checking" }
  | { status: "none" }
  | { status: "locked" }
  | { status: "opened"; opened: OpenedRightsManagedPdf };

export function useRightsManagedPdf(
  file: File | null | undefined,
): RightsManagedPdfState {
  useSyncExternalStore(
    subscribeRightsManagedPdfs,
    rightsManagedPdfRevision,
    rightsManagedPdfRevision,
  );
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
