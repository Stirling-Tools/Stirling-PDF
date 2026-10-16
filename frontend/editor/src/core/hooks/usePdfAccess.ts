import { useEffect, useSyncExternalStore } from "react";
import { unlockPdfForSession } from "@app/services/pdfSessionUnlock";
import {
  getPdfAccess,
  rememberPdfAccess,
  pdfAccessRevision,
  subscribePdfAccess,
} from "@app/services/pdfPasswordStore";

/** Observe session access without persisting the password in document metadata. */
export function usePdfAccess(file: Blob | string | null | undefined) {
  useSyncExternalStore(
    subscribePdfAccess,
    pdfAccessRevision,
    pdfAccessRevision,
  );
  useEffect(() => {
    if (!(file instanceof File) || getPdfAccess(file)) return;
    let cancelled = false;
    void unlockPdfForSession(file, "")
      .then((access) => {
        if (!cancelled && !getPdfAccess(file)) rememberPdfAccess(file, access);
      })
      .catch(() => {
        /* A failed inspection cannot grant permissions. */
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  return getPdfAccess(file);
}
