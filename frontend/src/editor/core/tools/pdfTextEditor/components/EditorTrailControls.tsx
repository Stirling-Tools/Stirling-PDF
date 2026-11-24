import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";

/**
 * The review's end of the editor bar: Save, with the unsaved-changes dot beside it.
 * The viewer bar's accessibility toggle closes the review.
 */
export function EditorTrailControls({ state }: { state: EditorViewState }) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const ready = !!session && state.hasDocument;
  return (
    <>
      {state.dirty && (
        <span
          className="pdf-editor-topbar__dirty"
          data-testid="pdf-editor-dirty-dot"
          role="status"
          aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
          title={t("pdfTextEditor.unsaved", "(unsaved)")}
        />
      )}
      <Tooltip
        label={t("pdfTextEditor.trail.saveTooltip", {
          defaultValue: "Save to your workspace ({{shortcut}})",
          shortcut: modShortcut("S"),
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={!ready || !state.dirty}
          onClick={() => session?.save()}
          leftSection={<Icon name="save" size={18} />}
          data-testid="pdf-editor-trail-save"
          style={NO_SHRINK}
        >
          {t("pdfTextEditor.trail.save", "Save")}
        </Button>
      </Tooltip>
    </>
  );
}
