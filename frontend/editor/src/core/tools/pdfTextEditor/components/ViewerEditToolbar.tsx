import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { useEditorStoreView } from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";
import { EditorTopBar } from "@app/tools/pdfTextEditor/components/EditorTopBar";
import { FindBar } from "@app/tools/pdfTextEditor/components/FindBar";
import { EditorSettingsMenu } from "@app/tools/pdfTextEditor/components/EditorSettingsMenu";
import { ViewerEditFloatingBar } from "@app/tools/pdfTextEditor/components/ViewerEditFloatingBar";

/** Names the mode the strip belongs to, so it reads as editing, not a second toolbar. */
function EditingChip() {
  const { t } = useTranslation();
  return (
    <span
      className="pdf-editor-topbar__mode"
      data-testid="pdf-editor-mode-chip"
    >
      <Icon name="type" size={15} />
      {t("pdfTextEditor.toolbar.editingText", "Editing text")}
    </span>
  );
}

/**
 * The way out of editing, ahead of the mode marker. The viewer's tool row folds
 * away while editing, so this is the only exit, and it asks before dropping
 * unsaved edits.
 */
function EditingLead() {
  const { t } = useTranslation();
  const { handleBackToTools } = useToolWorkflow();
  const { requestNavigation } = useNavigationGuard();
  return (
    <>
      <Tooltip
        label={t(
          "pdfTextEditor.toolbar.backTooltip",
          "Stop editing and go back to the viewer",
        )}
      >
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          leftSection={<Icon name="arrow-left" size={18} />}
          onClick={() => requestNavigation(handleBackToTools)}
          data-testid="pdf-editor-back"
        >
          {t("pdfTextEditor.toolbar.back", "Back")}
        </Button>
      </Tooltip>
      <EditingChip />
    </>
  );
}

/** The editor's document actions, docked above the viewer while text editing;
 * the selection's own tools float beside it on the page. */
export default function ViewerEditToolbar() {
  const { store, state } = useEditorStoreView();
  const [selection, setSelection] = useState(store.selection.value);
  useEffect(() => store.selection.subscribe(setSelection), [store]);
  const controller = useToolbarController(store, state, selection);

  return (
    <>
      <EditorTopBar
        controller={controller}
        hasDocument={state.hasDocument}
        dirty={state.dirty}
        addTextArmed={state.mode === "addText"}
        onToggleAddText={() =>
          store.setMode(
            store.getState().mode === "addText" ? "select" : "addText",
          )
        }
        addTableArmed={state.mode === "addTable"}
        onToggleAddTable={() =>
          store.setMode(
            store.getState().mode === "addTable" ? "select" : "addTable",
          )
        }
        findOpen={state.findOpen}
        onToggleFind={() => store.setFindOpen(!store.getState().findOpen)}
        onShowHelp={() => store.setHelpOpen(true)}
        showSelectionTools={false}
        showFile={false}
        labelled
        tinted
        lead={<EditingLead />}
        trailing={<EditorSettingsMenu store={store} state={state} />}
        findPanel={
          state.hasDocument ? (
            <FindBar
              store={store}
              pages={state.pages}
              onClose={() => store.setFindOpen(false)}
            />
          ) : undefined
        }
      />
      <ViewerEditFloatingBar
        store={store}
        state={state}
        selection={selection}
        controller={controller}
      />
    </>
  );
}
