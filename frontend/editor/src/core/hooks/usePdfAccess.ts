import { useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { probePdfPermissions } from "@app/services/pdfPermissionProbe";
import {
  buildPdfAccessFromSnapshot,
  getPdfAccess,
  rememberPdfAccess,
  pdfAccessRevision,
  subscribePdfAccess,
} from "@app/services/pdfPasswordStore";

/**
 * Observe session access without persisting the password in document metadata.
 *
 * Access is read from the file's own bytes, so it is known as soon as the
 * probe resolves; the former empty-password inspection left it undefined for
 * a network round trip and gated permission-dependent UI on that window.
 */
export function usePdfAccess(file: Blob | string | null | undefined) {
  useSyncExternalStore(
    subscribePdfAccess,
    pdfAccessRevision,
    pdfAccessRevision,
  );
  const { config } = useAppConfig();
  const honorOwnerPasswords = config?.honorOwnerPasswords;
  useEffect(() => {
    if (!(file instanceof File) || getPdfAccess(file)) return;
    let cancelled = false;
    void probePdfPermissions(file).then((snapshot) => {
      if (cancelled || !snapshot || snapshot.requiresOpeningPassword) return;
      if (!getPdfAccess(file))
        rememberPdfAccess(
          file,
          buildPdfAccessFromSnapshot(snapshot, honorOwnerPasswords),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [file, honorOwnerPasswords]);
  return getPdfAccess(file);
}
