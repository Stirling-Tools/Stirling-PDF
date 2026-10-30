import { useEffect } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { surfacesAnnotationSaveUi } from "@editor/components/viewer/annotationSaveSurface";
import type { AnnotationMenuAnchor } from "@editor/components/viewer/viewerTypes";
import { useDocumentEditDispatch } from "@editor/contexts/documentEdit/DocumentEditSessionContext";

interface AnnotationMenuEventsProps {
  /** Last on-screen anchor for an annotation, even after it was deselected. */
  getAnchor: (annotationId: string) => AnnotationMenuAnchor | null;
  onDeleted: (anchor: AnnotationMenuAnchor) => void;
}

/** Opens the menu for a committed edit, an undo menu for a committed delete,
 *  and reports user edits so the caller can surface the save UI. */
export function AnnotationMenuEvents({
  getAnchor,
  onDeleted,
}: AnnotationMenuEventsProps) {
  const documentId = useActiveDocumentId();
  const { provides } = useAnnotationCapability();
  const dispatchEdit = useDocumentEditDispatch();

  useEffect(() => {
    if (!provides || !documentId) return;
    // Previews share this bridge; their edits are not edits of the open
    // document, so they must not surface the save UI. Menu events still flow.
    const isPreview = documentId.startsWith("preview-");

    return provides.onAnnotationEvent((event) => {
      if (event.type === "loaded") return;
      if (!event.committed) return;

      if (!isPreview && surfacesAnnotationSaveUi(event.annotation)) {
        dispatchEdit({ type: "ANNOTATION_EDIT_COMMITTED" });
      }

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
  }, [provides, documentId, getAnchor, onDeleted, dispatchEdit]);

  return null;
}
