import { openExternal } from "@editor/platform/openExternal";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL;

function openFeedbackPage(): void {
  void openExternal(FEEDBACK_URL);
}

/**
 * How this build takes someone to give feedback, or null when it has nowhere to
 * send them. Shadowed by builds that can collect feedback in the app itself.
 * Callers want `useFeedback`, which also honours the server's switch.
 */
export function useOpenFeedback(): (() => void) | null {
  return FEEDBACK_URL ? openFeedbackPage : null;
}
