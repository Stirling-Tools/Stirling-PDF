import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { CloseReviewButton } from "@editor/tools/pdfTextEditor/components/review/CloseReviewButton";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";

/** The review's end of the editor bar: Save and the toggle that closes the review. */
export function EditorTrailControls({ state }: { state: EditorViewState }) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const ready = !!session && state.hasDocument;
  return (
    <>
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
      <CloseReviewButton />
    </>
  );
}
