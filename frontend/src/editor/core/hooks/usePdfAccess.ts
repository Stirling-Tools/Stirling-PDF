import { useSyncExternalStore } from "react";
import {
  getPdfAccess,
  pdfAccessRevision,
  subscribePdfAccess,
} from "@editor/services/pdfAccessService";

/** Observe session access without persisting the password in document metadata. */
export function usePdfAccess(file: Blob | string | null | undefined) {
  useSyncExternalStore(
    subscribePdfAccess,
    pdfAccessRevision,
    pdfAccessRevision,
  );
  return getPdfAccess(file);
}
