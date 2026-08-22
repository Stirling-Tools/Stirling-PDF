/**
 * Shared commit boilerplate for the create and modify panels: run an async
 * action that produces the edited PDF blob, hand it to the viewer, and track
 * committing/error state. Keeps both panels from repeating the same
 * try/catch/dispatch dance.
 */
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { dispatchFormApply } from "@app/tools/formFill/formFillEvents";

/**
 * These endpoints are requested with responseType "blob", so a 400's ProblemDetail
 * arrives as a Blob and err.message is only "Request failed with status code 400".
 * Read the body so the user sees which field name the backend refused.
 */
async function serverMessage(err: unknown): Promise<string | null> {
  if (!isAxiosError(err)) return null;
  const data: unknown = err.response?.data;
  try {
    const text = data instanceof Blob ? await data.text() : null;
    const parsed: unknown = text ? JSON.parse(text) : data;
    if (parsed && typeof parsed === "object") {
      const body = parsed as Record<string, unknown>;
      for (const key of ["detail", "message", "error", "title"]) {
        if (typeof body[key] === "string" && body[key]) return body[key];
      }
    }
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

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
          (await serverMessage(err)) ||
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
