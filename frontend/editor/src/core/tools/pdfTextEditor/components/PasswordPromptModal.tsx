import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";

interface PasswordPromptModalProps {
  /** Non-null opens the modal; null keeps it closed. */
  prompt: { fileName: string; retry: boolean } | null;
  loading: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPromptModal({
  prompt,
  loading,
  onSubmit,
  onCancel,
}: PasswordPromptModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  useEffect(() => {
    setPassword("");
  }, [prompt?.fileName, prompt?.retry]);

  return (
    <EncryptedPdfUnlockModal
      opened={!!prompt}
      fileName={prompt?.fileName}
      password={password}
      sessionUnlock
      isProcessing={loading}
      onPasswordChange={setPassword}
      onUnlock={() => {
        if (password && !loading) onSubmit(password);
      }}
      onSkip={onCancel}
      errorMessage={
        prompt?.retry
          ? t(
              "pdfTextEditor.password.incorrect",
              "Incorrect password - try again.",
            )
          : undefined
      }
      testIdPrefix="pdf-editor-password"
    />
  );
}
