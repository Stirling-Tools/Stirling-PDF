import { useState } from "react";
import { useTranslation } from "react-i18next";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import { refreshNotificationsNow } from "@app/hooks/useNotifications";
import type { PasswordPrompt } from "@app/components/notifications/NotificationItem";

/**
 * The password an action asked for, owned above the panel rather than by the row that offered it:
 * the panel unmounts on any outside click, which would take a prompt a row owned with it.
 */
export function useNotificationPasswordPrompt(closePanel: () => void) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
  // Held only while the prompt is open, and dropped as soon as it closes.
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPrompt(null);
    setPassword("");
    setError(null);
  };

  const submit = async () => {
    if (!prompt || busy || password === "") return;
    setBusy(true);
    setError(null);
    const outcome = await prompt.spec.run(prompt.context, password);
    setBusy(false);
    // The prompt stays open, so a second attempt costs a keystroke rather than a re-open.
    if (outcome && !outcome.ok) {
      setError(
        outcome.message ??
          t(
            "notifications.action.failed",
            "That did not work. Try again in a moment.",
          ),
      );
      return;
    }
    close();
    // The incident was resolved server-side, so the list is re-read rather than patched here.
    refreshNotificationsNow();
    if (prompt.spec.closesPanel) closePanel();
  };

  return {
    requestPassword: setPrompt,
    /* Rendered beside the panel, not inside it: it has to outlive the panel dismissing behind it. */
    promptModal: (
      <EncryptedPdfUnlockModal
        opened={prompt !== null}
        fileName={prompt?.rowTitle}
        password={password}
        errorMessage={error}
        isProcessing={busy}
        confirmLabel={
          prompt
            ? t(prompt.offer.labelKey, prompt.offer.defaultLabel)
            : undefined
        }
        onPasswordChange={setPassword}
        onUnlock={() => void submit()}
        onSkip={close}
      />
    ),
  };
}
