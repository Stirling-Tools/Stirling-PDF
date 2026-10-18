import { useEffect } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import type { AnnotationMenuAnchor } from "@app/components/viewer/viewerTypes";

interface AnnotationMenuEventsProps {
  /** Last on-screen anchor for an annotation, even after it was deselected. */
  getAnchor: (annotationId: string) => AnnotationMenuAnchor | null;
  onDeleted: (anchor: AnnotationMenuAnchor) => void;
}

/** Opens the menu for a committed edit, or an undo menu for a committed delete. */
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
