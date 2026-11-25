import { useOpenFeedback as useOpenFeedbackPage } from "@editor-core/hooks/useOpenFeedback";
import { useUserbackInstance } from "@editor/components/feedback/userbackInstance";

/**
 * Opens the Userback form in place once it has loaded, which takes a SaaS
 * sign-in, and the feedback page in the browser otherwise.
 */
export function useOpenFeedback(): (() => void) | null {
  const userback = useUserbackInstance();
  const openFeedbackPage = useOpenFeedbackPage();
  return userback ? () => userback.open() : openFeedbackPage;
}
