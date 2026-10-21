import { useEffect } from "react";
import { useDocumentEditSession } from "@app/contexts/documentEdit/DocumentEditSessionContext";

/**
 * The viewer watches the edit revision only to surface the Annotate panel, and
 * a comment edited in the sidebar commits per keystroke. Subscribing from a
 * leaf keeps those commits from re-rendering the viewer itself; the panel this
 * opens still updates.
 */
export function AnnotationDirtyWatcher({ onDirty }: { onDirty: () => void }) {
  const { workingRevision } = useDocumentEditSession();

  useEffect(() => {
    if (workingRevision > 0) {
      onDirty();
    }
  }, [workingRevision, onDirty]);

  return null;
}
