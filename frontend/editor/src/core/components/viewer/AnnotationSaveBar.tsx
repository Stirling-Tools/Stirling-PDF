import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useViewer } from "@app/contexts/ViewerContext";
import { useEventCallback } from "@app/hooks/useEventCallback";
import {
  useDocumentEditDispatch,
  useDocumentEditSession,
} from "@app/contexts/documentEdit/DocumentEditSessionContext";

/**
 * Persistent save affordance for annotation edits.
 *
 * An annotation edit made from the canvas — recolouring a mark, nudging it, the
 * opacity slider — previously surfaced the save action by force-selecting the
 * Annotate tool. That moved the whole layout, rebuilt any open colour picker,
 * and read as a flicker. This surface replaces that navigation: it is an
 * absolutely positioned overlay, so appearing changes no layout and remounts
 * nothing, and the user keeps whatever tool and menu they were using.
 *
 * Redaction is deliberately not here. Applying it is irreversible and has its own
 * transactional flow in the redaction panel.
 */
export function AnnotationSaveBar() {
  const { t } = useTranslation();
  const { annotation, persistence, workingRevision } = useDocumentEditSession();
  const dispatch = useDocumentEditDispatch();
  const { applyChanges } = useViewer();

  const visible = annotation.saveSurface === "visible" && annotation.dirty;
  const saving = persistence.phase === "saving";

  const handleSave = useEventCallback(async () => {
    if (saving || !applyChanges) return;
    const revision = workingRevision;
    dispatch({ type: "ANNOTATION_SAVE_REQUESTED" });
    try {
      await applyChanges();
      dispatch({ type: "ANNOTATION_SAVE_SUCCEEDED", revision });
    } catch {
      dispatch({
        type: "ANNOTATION_SAVE_FAILED",
        error: {
          message: t(
            "viewer.annotation.failed",
            "The document could not be saved. Try again.",
          ),
        },
      });
    }
  });

  // Ctrl/Cmd+S, so saving never requires leaving the canvas.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, handleSave]);

  if (!visible) return null;

  return (
    <div
      data-annotation-save-surface
      style={{
        // Absolute, not in flow: appearing must not resize the document viewport.
        position: "absolute",
        top: 8,
        right: 12,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 6px 4px 10px",
        borderRadius: 8,
        border: "1px solid var(--c-border)",
        background: "var(--c-bg-elevated, var(--c-bg))",
        boxShadow: "0 2px 8px rgb(0 0 0 / 0.18)",
        pointerEvents: "auto",
      }}
    >
      <span
        aria-live="polite"
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
      >
        <Icon name="pencil" size="0.9rem" />
        {persistence.error?.message ??
          t("viewer.annotation.dirty", "Unsaved annotation changes")}
      </span>
      <Button
        size="sm"
        variant="primary"
        loading={saving}
        disabled={saving || !applyChanges}
        onClick={() => void handleSave()}
      >
        {t("annotation.saveChanges", "Save Changes")}
      </Button>
    </div>
  );
}
