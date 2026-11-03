import { useSyncExternalStore } from "react";
import { useOpenFeedback as useOpenFeedbackPage } from "@editor-core/hooks/useOpenFeedback";
import {
  getUserbackInstance,
  subscribeUserbackInstance,
} from "@editor/components/feedback/userbackInstance";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

/**
 * Opens the Userback form in place once it has loaded, and the feedback page
 * until then. Null when the build has no Userback token, which turns feedback off.
 */
export function useOpenFeedback(): (() => void) | null {
  const userback = useSyncExternalStore(
    subscribeUserbackInstance,
    getUserbackInstance,
  );
  const openFeedbackPage = useOpenFeedbackPage();
  if (!USERBACK_TOKEN) return null;
  return userback ? () => userback.open() : openFeedbackPage;
}
