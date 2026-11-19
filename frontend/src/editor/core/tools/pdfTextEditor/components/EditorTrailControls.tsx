import { useEffect, useState } from "react";
import { Popover, ScrollArea, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { EditorSidebar } from "@editor/tools/pdfTextEditor/components/EditorSidebar";
import { ReviewToggle } from "@editor/tools/pdfTextEditor/components/review/ReviewToggle";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { useReviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

interface Props {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
}

/**
 * Save, the review toggle and, while a review runs under another tool, the
 * inspector the editor's hidden panel holds.
 */
export function EditorTrailControls({ store, state, selection }: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const ready = !!session && state.hasDocument;
  const inspectorInPanel =
    useNavigationState().selectedTool === "pdfTextEditor";
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { inspectorTab } = useReviewMode();
  useEffect(() => {
    if (inspectorTab && !inspectorInPanel) setInspectorOpen(true);
  }, [inspectorTab, inspectorInPanel]);

  return (
    <>
      {!inspectorInPanel && (
        <Popover
          position="bottom-end"
          withinPortal
          shadow="md"
          width={340}
          disabled={!ready}
          opened={inspectorOpen}
          onChange={setInspectorOpen}
        >
          <Popover.Target>
            <Button
              size="sm"
              variant="tertiary"
              accent="neutral"
              disabled={!ready}
              onClick={() => setInspectorOpen((open) => !open)}
              leftSection={<Icon name="sliders-horizontal" size={18} />}
              rightSection={<Icon name="chevron-down" size={14} />}
              data-testid="pdf-editor-properties"
              style={NO_SHRINK}
            >
              {t("pdfTextEditor.trail.properties", "Properties")}
            </Button>
          </Popover.Target>
          <Popover.Dropdown p={0}>
            {session && (
              <ScrollArea.Autosize mah="70vh" type="auto">
                <EditorSidebar
                  store={store}
                  state={state}
                  selection={selection}
                  {...session.inspector}
                  onSetGroupingMode={(mode) => store.setGroupingMode(mode)}
                  onSetWidthMode={(mode) => store.setWidthMode(mode)}
                  onSetShowRulers={(show) => store.setShowRulers(show)}
                  answersFixRequests
                />
              </ScrollArea.Autosize>
            )}
          </Popover.Dropdown>
        </Popover>
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
      <ReviewToggle />
    </>
  );
}
