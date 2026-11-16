import { useCallback, useEffect, useRef } from "react";

/** Waits for a particular file's viewer load; unrelated document events cannot settle it. */
export function useDocumentLoadWaiter() {
  const mountedRef = useRef(true);
  const pendingRef = useRef<{
    fileKey: string;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current?.reject(
        new Error("The viewer closed before the form finished saving."),
      );
      pendingRef.current = null;
    };
  }, []);

  const waitForDocument = useCallback((fileKey: string) => {
    if (!mountedRef.current)
      return Promise.reject(
        new Error("The viewer closed before the form finished saving."),
      );
    pendingRef.current?.reject(
      new Error("The pending document load was replaced."),
    );
    return new Promise<void>((resolve, reject) => {
      pendingRef.current = { fileKey, resolve, reject };
    });
  }, []);

  const documentReady = useCallback((fileKey: string) => {
    if (pendingRef.current?.fileKey !== fileKey) return;
    pendingRef.current.resolve();
    pendingRef.current = null;
  }, []);

  const documentFailed = useCallback((fileKey: string, error: unknown) => {
    if (pendingRef.current?.fileKey !== fileKey) return;
    pendingRef.current.reject(
      error instanceof Error
        ? error
        : new Error("The saved PDF could not be opened."),
    );
    pendingRef.current = null;
  }, []);

  return { waitForDocument, documentReady, documentFailed };
}
