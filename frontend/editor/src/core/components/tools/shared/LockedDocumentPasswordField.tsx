import { Alert, PasswordInput, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MiddleStepConfig } from "@app/components/tools/shared/createToolFlow";
import {
  forgetLockedDocumentAccess,
  getLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";
import {
  useLockedDocuments,
  type LockedDocumentMode,
  type LockedDocumentSummary,
} from "@app/hooks/tools/shared/useLockedDocuments";
import type { StirlingFile } from "@app/types/fileContext";

interface LockedDocumentPasswordFieldProps {
  summary: LockedDocumentSummary;
  mode: LockedDocumentMode;
  disabled?: boolean;
}

/**
 * Password for selected PDFs still locked, or a note that an unlocked copy goes out as its original.
 * The password goes to the in-memory access store, never to tool params (saved with automations).
 */
export function LockedDocumentPasswordField({
  summary,
  mode,
  disabled = false,
}: LockedDocumentPasswordFieldProps) {
  const { t } = useTranslation();
  const { usingOriginal, needsPassword, enteredPassword, passwordRejected } =
    summary;
  if (usingOriginal.length === 0 && needsPassword.length === 0) return null;

  const handleChange = (password: string) => {
    for (const file of needsPassword) {
      if (password) {
        setLockedDocumentAccess(file.fileId, {
          source: file,
          password,
          origin: "entered",
        });
      } else if (getLockedDocumentAccess(file.fileId)?.origin === "entered") {
        forgetLockedDocumentAccess(file.fileId);
      }
    }
  };

  return (
    <Stack gap="sm">
      {usingOriginal.length > 0 && (
        <Alert
          color="blue"
          variant="light"
          data-testid="locked-document-original-notice"
        >
          {mode === "audit"
            ? t(
                "lockedDocument.usingOriginalAudit",
                "Using the original locked file you uploaded, so its signatures are checked exactly as they were signed.",
              )
            : t(
                "lockedDocument.usingOriginalAppend",
                "Using the original locked file you uploaded, so existing signatures stay valid.",
              )}
        </Alert>
      )}
      {needsPassword.length > 0 && (
        <PasswordInput
          label={t("lockedDocument.password.label", "PDF password")}
          description={
            mode === "audit"
              ? t(
                  "lockedDocument.password.auditDescription",
                  "This PDF is still locked. Enter its password to check its signatures; the file is not changed.",
                )
              : t(
                  "lockedDocument.password.appendDescription",
                  "This PDF is still locked. Enter its password; the new signature is added to the locked file, so existing signatures stay valid and the result stays password protected.",
                )
          }
          placeholder={t(
            "lockedDocument.password.placeholder",
            "Enter the PDF password",
          )}
          value={enteredPassword}
          error={
            passwordRejected
              ? t(
                  "lockedDocument.password.rejected",
                  "That password did not open this PDF. Check it and try again.",
                )
              : undefined
          }
          onChange={(event) => handleChange(event.currentTarget.value)}
          disabled={disabled}
          autoComplete="off"
          data-testid="locked-document-password"
        />
      )}
    </Stack>
  );
}

interface LockedDocumentStepOptions {
  files: readonly StirlingFile[];
  mode: LockedDocumentMode;
  disabled?: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
}

/**
 * A tool step holding {@link LockedDocumentPasswordField}, shown only when a selected file is
 * locked or will be sent as its original. `ready` is false until every locked file has a password.
 */
export function useLockedDocumentStep({
  files,
  mode,
  disabled,
  isCollapsed,
  onCollapsedClick,
}: LockedDocumentStepOptions): { step: MiddleStepConfig; ready: boolean } {
  const { t } = useTranslation();
  const summary = useLockedDocuments(files);
  return {
    ready: summary.ready,
    step: {
      title: t("lockedDocument.stepTitle", "Locked PDF"),
      isVisible:
        summary.usingOriginal.length > 0 || summary.needsPassword.length > 0,
      isCollapsed,
      onCollapsedClick,
      content: (
        <LockedDocumentPasswordField
          summary={summary}
          mode={mode}
          disabled={disabled}
        />
      ),
    },
  };
}
