import { useEffect } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import type { AnnotationMenuAnchor } from "@app/components/viewer/viewerTypes";

interface AnnotationMenuEventsProps {
  /** Last on-screen anchor for an annotation, even after it was deselected. */
  getAnchor: (annotationId: string) => AnnotationMenuAnchor | null;
  onDeleted: (anchor: AnnotationMenuAnchor) => void;
}

/**
 * Keeps the selection menu in step with annotation edits made anywhere else:
 * a committed update opens the menu for the annotation that changed, and a
 * delete leaves an undo menu at the anchor the selection menu last reported.
 */
export function AnnotationMenuEvents({
  getAnchor,
  onDeleted,
}: AnnotationMenuEventsProps) {
  const documentId = useActiveDocumentId();
  const { provides } = useAnnotationCapability();

  useEffect(() => {
    if (!provides || !documentId) return;

    return provides.onAnnotationEvent((event) => {
      if (event.type === "loaded") return;
      if (!event.committed) return;

      if (event.type === "delete") {
        const anchor = getAnchor(event.annotation.id);
        if (anchor) {
          onDeleted(anchor);
        }
        return;
      }

      if (event.type !== "update") return;
      const selected = provides.getSelectedAnnotationIds?.() ?? [];
      if (selected.includes(event.annotation.id)) return;
      provides.selectAnnotation?.(event.pageIndex, event.annotation.id);
    });
  }, [provides, documentId, getAnchor, onDeleted]);

  return null;
}
