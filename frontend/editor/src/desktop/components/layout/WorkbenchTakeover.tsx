import type { ReactNode } from "react";
import { ClassificationDemoWorkbenchView } from "@app/components/onboarding/classificationDemo/ClassificationDemoWorkbenchView";
import {
  endClassificationDemo,
  useClassificationDemoSession,
} from "@app/components/onboarding/classificationDemo/classificationDemoSession";

/** Onboarding's Downloads sweep owns the canvas from acceptance until dismissal.
 *  See the core stub for why this is a takeover, not a registered custom view. */
export function useWorkbenchTakeover(): ReactNode | null {
  const run = useClassificationDemoSession();
  if (!run) return null;
  return (
    <ClassificationDemoWorkbenchView
      data={run}
      onDone={endClassificationDemo}
    />
  );
}
