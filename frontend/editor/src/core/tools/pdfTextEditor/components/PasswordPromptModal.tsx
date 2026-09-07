import { useEffect, useState } from "react";
import { Modal, Stack, Text, Group, PasswordInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";

interface PasswordPromptModalProps {
  /** Non-null opens the modal; null keeps it closed. */
  prompt: { fileName: string; retry: boolean } | null;
  /** True while a retry load is running, so inputs disable. */
  loading: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

// Asks the user for a password to open an encrypted PDF, then retries the load.
// `prompt.retry` means the previous password was wrong.
export function PasswordPromptModal({
  prompt,
  loading,
  onSubmit,
  onCancel,
}: PasswordPromptModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");

  // Clear the field whenever the prompt opens/closes so a new file (or a
  // wrong-password reprompt) never shows the previous attempt.
  useEffect(() => {
    setPassword("");
  }, [prompt?.fileName, prompt?.retry]);

  const submit = () => {
    if (!password) return;
    onSubmit(password);
  };

  return (
    <Modal
      opened={!!prompt}
      onClose={onCancel}
      title={t("pdfTextEditor.password.title", "Password required")}
      size="sm"
      data-testid="pdf-editor-password-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          {prompt?.fileName
            ? t(
                "pdfTextEditor.password.protectedNamed",
                '"{{fileName}}" is password-protected.',
                { fileName: prompt.fileName },
              )
            : t(
                "pdfTextEditor.password.protected",
                "This PDF is password-protected.",
              )}
        </Text>
        <PasswordInput
          label={t("pdfTextEditor.password.label", "Password")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          error={
            prompt?.retry
              ? t(
                  "pdfTextEditor.password.incorrect",
                  "Incorrect password - try again.",
                )
              : undefined
          }
          disabled={loading}
          data-autofocus
          data-testid="pdf-editor-password-input"
        />
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onCancel}
            disabled={loading}
            data-testid="pdf-editor-password-cancel"
          >
            {t("pdfTextEditor.password.cancel", "Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={loading}
            disabled={!password}
            data-testid="pdf-editor-password-submit"
          >
            {t("pdfTextEditor.password.open", "Open")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
