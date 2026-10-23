import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import EncryptedPdfUnlockModal from "@editor/components/shared/EncryptedPdfUnlockModal";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import {
  rememberPdfAccess,
  inspectLocalPdfAccess,
} from "@editor/services/pdfAccessService";
import { pdfAllows } from "@editor/services/pdfPermissions";
import { PdfPermissionFlag } from "@embedpdf/models";

import { Button } from "@editor/ui/Button";
import { handlePasswordError } from "@editor/utils/toolErrorHandler";

/** Verifies editing permission for the failed document before retrying its existing load flow. */
export function PermissionsPasswordButton({
  file,
  onVerified,
}: {
  file: File | null | undefined;
  onVerified: (file: File) => void;
}) {
  const { t } = useTranslation();
  const access = usePdfAccess(file);
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    setOpened(false);
    setPassword("");
    setError(null);
    setBusy(false);
    return () => pending.current?.abort();
  }, [file]);

  if (
    !file ||
    !access?.encrypted ||
    access.signed ||
    pdfAllows(access, PdfPermissionFlag.ModifyContents)
  )
    return null;

  const verify = async () => {
    if (busy || !password) return;
    const cancellation = new AbortController();
    pending.current = cancellation;
    setBusy(true);
    setError(null);
    try {
      const verified = await inspectLocalPdfAccess(
        file,
        password,
        cancellation.signal,
      );
      if (cancellation.signal.aborted) return;
      if (!verified.ownerAuthenticated) {
        setError(
          t(
            "encryptedPdfUnlock.ownerRequired",
            "Enter the permissions password to allow restricted actions.",
          ),
        );
        return;
      }
      rememberPdfAccess(file, verified);
      setOpened(false);
      setPassword("");
      onVerified(file);
    } catch (failure) {
      if (!cancellation.signal.aborted) {
        const message = await handlePasswordError(
          failure,
          t("encryptedPdfUnlock.incorrectPassword", "Incorrect password"),
          t(
            "encryptedPdfUnlock.sessionFailed",
            "Unable to verify this password. Please try again.",
          ),
        );
        if (!cancellation.signal.aborted) setError(message);
      }
    } finally {
      if (!cancellation.signal.aborted) setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpened(true)}>
        {t("encryptedPdfUnlock.ownerTitle", "Enter permissions password")}
      </Button>
      <EncryptedPdfUnlockModal
        opened={opened}
        fileName={file.name}
        password={password}
        errorMessage={error}
        sessionUnlock
        ownerUnlock
        isProcessing={busy}
        onPasswordChange={setPassword}
        onUnlock={() => void verify()}
        onSkip={() => {
          setOpened(false);
          setPassword("");
          setError(null);
        }}
      />
    </>
  );
}
