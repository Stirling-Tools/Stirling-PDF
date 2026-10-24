import { useEffect, useRef } from "react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";

interface InitialDocumentLoadBridgeProps {
  fileKey: string | null;
  onReady: (fileKey: string) => void;
  onFailed: (fileKey: string, error: unknown) => void;
}

/** Reports the registry's initial load, which never passes through DocumentSwapBridge. */
export function InitialDocumentLoadBridge({
  fileKey,
  onReady,
  onFailed,
}: InitialDocumentLoadBridgeProps) {
  const { activeDocument } = useActiveDocument();
  const completedRef = useRef(false);
  const generationRef = useRef(0);
  useEffect(() => {
    const generation = ++generationRef.current;
    return () => {
      queueMicrotask(() => {
        if (
          fileKey &&
          !completedRef.current &&
          generationRef.current === generation
        ) {
          onFailed(fileKey, new Error("The document load was cancelled."));
        }
      });
    };
  }, [fileKey, onFailed]);
  useEffect(() => {
    if (activeDocument?.status === "loading") completedRef.current = false;
    if (!fileKey || completedRef.current) return;
    if (activeDocument?.status === "loaded") {
      completedRef.current = true;
      onReady(fileKey);
    } else if (activeDocument?.status === "error") {
      completedRef.current = true;
      onFailed(
        fileKey,
        new Error(activeDocument.error ?? "The saved PDF could not be opened."),
      );
    }
  }, [fileKey, activeDocument, onReady, onFailed]);
  return null;
}
