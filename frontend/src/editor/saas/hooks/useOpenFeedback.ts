import { useSyncExternalStore } from "react";
import { useOpenFeedback as useOpenFeedbackPage } from "@editor-core/hooks/useOpenFeedback";
import {
  getUserbackInstance,
  subscribeUserbackInstance,
} from "@editor/components/feedback/userbackInstance";

/** Opens the Userback form in place once it has loaded, and the feedback page until then. */
export function useOpenFeedback(): (() => void) | null {
  const userback = useSyncExternalStore(
    subscribeUserbackInstance,
    getUserbackInstance,
  );
  const openFeedbackPage = useOpenFeedbackPage();
  return userback ? () => userback.open() : openFeedbackPage;
}
