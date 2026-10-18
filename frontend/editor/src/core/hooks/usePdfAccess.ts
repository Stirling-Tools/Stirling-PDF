import { useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import {
  getProbeSnapshot,
  probePdfPermissions,
} from "@app/services/pdfPermissionProbe";
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
    if (!(file instanceof File)) return;
    const existing = getPdfAccess(file);
    if (existing) {
      // Policy can load or refetch after a file is opened, so rebuild probe
      // derived access from the facts already read instead of probing again.
      // Credentials from a real password unlock keep the server's verdict.
      const probeDerived =
        existing.encrypted &&
        existing.password === "" &&
        !existing.credentialFingerprint;
      const snapshot = probeDerived ? getProbeSnapshot(file) : undefined;
      if (snapshot && existing.honorOwnerPasswords !== honorOwnerPasswords)
        rememberPdfAccess(
          file,
          buildPdfAccessFromSnapshot(snapshot, honorOwnerPasswords),
        );
      return;
    }
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
