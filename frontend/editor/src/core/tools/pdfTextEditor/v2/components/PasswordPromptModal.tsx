import { useEffect, useState } from "react";
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  PasswordInput,
} from "@mantine/core";

interface PasswordPromptModalProps {
  /** Non-null opens the modal; null keeps it closed. */
  prompt: { fileName: string; retry: boolean } | null;
  /** True while a retry load is running, so inputs disable. */
  loading: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/**
 * Asks the user for a password to open an encrypted PDF, then retries the
 * load. `prompt.retry` means the previous password was wrong.
 */
export function PasswordPromptModal({
  prompt,
  loading,
  onSubmit,
  onCancel,
}: PasswordPromptModalProps) {
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
      title="Password required"
      size="sm"
      data-testid="v2-password-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          {prompt?.fileName
            ? `"${prompt.fileName}" is password-protected.`
            : "This PDF is password-protected."}
        </Text>
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          error={prompt?.retry ? "Incorrect password - try again." : undefined}
          disabled={loading}
          data-autofocus
          data-testid="v2-password-input"
        />
        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={onCancel}
            disabled={loading}
            data-testid="v2-password-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={loading}
            disabled={!password}
            data-testid="v2-password-submit"
          >
            Open
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
