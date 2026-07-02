/**
 * Shared commit boilerplate for the create and modify panels: run an async
 * action that produces the edited PDF blob, hand it to the viewer, and track
 * committing/error state. Keeps both panels from repeating the same
 * try/catch/dispatch dance.
 */
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { dispatchFormApply } from "@app/tools/formFill/formFillEvents";

export function useFormCommit(onApplied?: (blob: Blob) => void) {
  const { t } = useTranslation();
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(
    async (
      run: () => Promise<Blob>,
      errorKey: string,
      errorFallback: string,
    ) => {
      setCommitting(true);
      setError(null);
      try {
        const blob = await run();
        dispatchFormApply(blob);
        onApplied?.(blob);
      } catch (err) {
        setError(
          (err instanceof Error ? err.message : undefined) ||
            t(errorKey, errorFallback),
        );
        console.error("[FormFill] commit failed:", err);
      } finally {
        setCommitting(false);
      }
    },
    [onApplied, t],
  );

  return { committing, error, setError, commit };
}
