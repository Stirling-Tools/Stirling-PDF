import { useEffect, useState } from "react";
import { Popover, ScrollArea, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { EditorSidebar } from "@editor/tools/pdfTextEditor/components/EditorSidebar";
import { CloseReviewButton } from "@editor/tools/pdfTextEditor/components/review/CloseReviewButton";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  useEditorInspector,
  useEditorSession,
} from "@editor/tools/pdfTextEditor/store/EditorSession";
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
 * Closes on a press outside the popover. Mantine's own check treats a press in
 * the language picker's portaled list as outside, so any portal is ignored.
 */
function useCloseOutsidePortals(
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPress = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-portal], [data-properties-toggle]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPress);
    document.addEventListener("touchstart", onPress);
    return () => {
      document.removeEventListener("mousedown", onPress);
      document.removeEventListener("touchstart", onPress);
    };
  }, [open, setOpen]);
}

/**
 * The review's end of the editor bar: Properties (the inspector the editor's
 * hidden panel holds), Save and the toggle that closes the review.
 */
export function EditorTrailControls({ store, state, selection }: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const inspector = useEditorInspector();
  const ready = !!session && state.hasDocument;
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { inspectorTab } = useReviewMode();
  useEffect(() => {
    if (inspectorTab) setInspectorOpen(true);
  }, [inspectorTab]);
  useCloseOutsidePortals(inspectorOpen, setInspectorOpen);

  return (
    <>
      <Popover
        position="bottom-end"
        withinPortal
        shadow="md"
        width={340}
        disabled={!ready}
        opened={inspectorOpen}
        onChange={setInspectorOpen}
        closeOnClickOutside={false}
      >
        <Popover.Target>
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            disabled={!ready}
            onClick={() => setInspectorOpen((open) => !open)}
            data-properties-toggle
            leftSection={<Icon name="sliders-horizontal" size={18} />}
            rightSection={<Icon name="chevron-down" size={14} />}
            data-testid="pdf-editor-properties"
            style={NO_SHRINK}
          >
            {t("pdfTextEditor.trail.properties", "Properties")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          {inspector && (
            <ScrollArea.Autosize mah="70vh" type="auto">
              <EditorSidebar
                store={store}
                state={state}
                selection={selection}
                {...inspector}
              />
            </ScrollArea.Autosize>
          )}
        </Popover.Dropdown>
      </Popover>
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
