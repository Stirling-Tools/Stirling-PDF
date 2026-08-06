import { AssistantButton } from "@processor/components/AssistantButton";
import { AssistantPanel } from "@processor/components/AssistantPanel";

/**
 * Mounts the floating AI assistant (blob button + slide-in panel). A flavor seam:
 * the SaaS build shadows this with a no-op so the assistant is hidden pre-release.
 */
export function AssistantMount() {
  return (
    <>
      <AssistantButton />
      <AssistantPanel />
    </>
  );
}
