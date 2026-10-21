import { useEffect, useRef, useState } from "react";
import axios, { type CancelTokenSource } from "axios";
import { useTranslation } from "react-i18next";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { rememberPdfAccess } from "@app/services/pdfPasswordStore";
import {
  hasPdfPermissionOverride,
  unlockPdfForSession,
} from "@app/services/pdfSessionUnlock";
import { Button } from "@app/ui/Button";
import { handlePasswordError } from "@app/utils/toolErrorHandler";

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
  const pending = useRef<CancelTokenSource | null>(null);

  useEffect(() => {
    setOpened(false);
    setPassword("");
    setError(null);
    setBusy(false);
    return () => pending.current?.cancel();
  }, [file]);

  if (
    !file ||
    !access?.encrypted ||
    access.signed ||
    access.canModify ||
    hasPdfPermissionOverride(access)
  )
    return null;

  const verify = async () => {
    if (busy || !password) return;
    const cancellation = axios.CancelToken.source();
    pending.current = cancellation;
    setBusy(true);
    setError(null);
    try {
      const verified = await unlockPdfForSession(
        file,
        password,
        cancellation.token,
      );
      cancellation.token.throwIfRequested();
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
      if (!axios.isCancel(failure)) {
        const message = await handlePasswordError(
          failure,
          t("encryptedPdfUnlock.incorrectPassword", "Incorrect password"),
          t(
            "encryptedPdfUnlock.sessionFailed",
            "Unable to verify this password. Please try again.",
          ),
        );
        if (!cancellation.token.reason) setError(message);
      }
    } finally {
      if (!cancellation.token.reason) setBusy(false);
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
