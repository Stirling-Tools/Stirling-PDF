import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Center, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import EncryptedPdfUnlockModal from "@editor/components/shared/EncryptedPdfUnlockModal";
import ToolLoadingFallback from "@editor/components/tools/ToolLoadingFallback";
import { useFileActions } from "@editor/contexts/FileContext";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { looksEncryptedFromTrailer } from "@editor/utils/pdfEncryptionProbe";
import { handlePasswordError } from "@editor/utils/toolErrorHandler";

interface PreviewState {
  file: File;
  status: "checking" | "ready" | "locked" | "rejected" | "error";
  prompt: boolean;
  error: string | null;
}

/** Keeps preview bytes outside the library and gates rendering until session access is known. */
export function PdfPreviewUnlockGate({
  file,
  onClose,
  children,
}: {
  file: File;
  onClose?: () => void;
  children: (onPasswordRequired: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const {
    actions: { unlockPreviewPdf },
  } = useFileActions();
  const access = usePdfAccess(file);
  const [state, setState] = useState<PreviewState | null>(null);
  const [password, setPassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setPassword("");
    setProcessing(false);
    setState({ file, status: "checking", prompt: false, error: null });
    const probe = async () => {
      if (getPdfAccess(file)) {
        setState({ file, status: "locked", prompt: false, error: null });
        return;
      }
      try {
        const protectedFile = await looksEncryptedFromTrailer(file);
        if (controller.signal.aborted) return;
        if (!protectedFile) {
          setState({ file, status: "ready", prompt: false, error: null });
          return;
        }
        try {
          // Owner-only protection opens with an empty password, but still carries print restrictions.
          await unlockPreviewPdf(file, "", controller.signal);
          if (!controller.signal.aborted)
            setState({ file, status: "locked", prompt: false, error: null });
        } catch (error) {
          const message = await handlePasswordError(
            error,
            "",
            t(
              "encryptedPdfUnlock.sessionFailed",
              "Unable to unlock this PDF. Please try again.",
            ),
          );
          if (!controller.signal.aborted)
            setState({
              file,
              status: "locked",
              prompt: true,
              error: message || null,
            });
        }
      } catch {
        if (!controller.signal.aborted)
          setState({
            file,
            status: "error",
            prompt: false,
            error: t(
              "encryptedPdfUnlock.sessionFailed",
              "Unable to unlock this PDF. Please try again.",
            ),
          });
      }
    };
    void probe();
    return () => controller.abort();
  }, [file, unlockPreviewPdf, t]);

  const requirePassword = useCallback(() => {
    setPassword("");
    setState({ file, status: "rejected", prompt: true, error: null });
  }, [file]);

  const unlock = async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || processing || !password)
      return;
    setProcessing(true);
    try {
      await unlockPreviewPdf(file, password, controller.signal);
      if (!controller.signal.aborted) {
        setPassword("");
        setState({ file, status: "locked", prompt: false, error: null });
      }
    } catch (error) {
      const message = await handlePasswordError(
        error,
        t("encryptedPdfUnlock.incorrectPassword", "Incorrect password"),
        t(
          "encryptedPdfUnlock.sessionFailed",
          "Unable to unlock this PDF. Please try again.",
        ),
      );
      if (!controller.signal.aborted)
        setState({ file, status: "rejected", prompt: true, error: message });
    } finally {
      if (!controller.signal.aborted) setProcessing(false);
    }
  };

  const current = state?.file === file ? state : null;
  if (
    (access && current?.status !== "rejected" && !current?.prompt) ||
    current?.status === "ready"
  )
    return children(requirePassword);
  if (!current || current.status === "checking") return <ToolLoadingFallback />;
  return (
    <>
      <Center style={{ flex: 1 }}>
        <Stack align="center" gap="md">
          <Text>
            {current.status === "error"
              ? current.error
              : t(
                  "encryptedPdfUnlock.viewerLocked",
                  "This PDF is password-protected",
                )}
          </Text>
          <Button onClick={requirePassword}>
            {t("encryptedPdfUnlock.viewerUnlock", "Unlock")}
          </Button>
          {onClose && (
            <Button variant="secondary" onClick={onClose}>
              {t("close", "Close")}
            </Button>
          )}
        </Stack>
      </Center>
      <EncryptedPdfUnlockModal
        opened={current.prompt}
        fileName={file.name}
        password={password}
        errorMessage={current.error}
        isProcessing={processing}
        sessionUnlock
        onPasswordChange={setPassword}
        onUnlock={() => void unlock()}
        onSkip={() => {
          setPassword("");
          setState({ ...current, prompt: false });
          onClose?.();
        }}
      />
    </>
  );
}
