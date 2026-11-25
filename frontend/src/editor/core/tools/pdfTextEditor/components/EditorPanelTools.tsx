import { Box, Group, Stack, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { SectionLabel } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import { useHistoryFlags } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

interface Props {
  store: EditorStore;
  state: EditorViewState;
  onOpenFind: () => void;
  onShowHelp: () => void;
}

/** History, find, shortcuts and insert tools at the head of the editor's side panel. */
export function EditorPanelTools({
  store,
  state,
  onOpenFind,
  onShowHelp,
}: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const history = useHistoryFlags(store);
  const addTextArmed = state.mode === "addText";
  const addTableArmed = state.mode === "addTable";
  const iconButton = (
    label: string,
    icon: Parameters<typeof Icon>[0]["name"],
    onClick: () => void,
    testId: string,
    extra: { disabled?: boolean; pressed?: boolean; tooltip?: string } = {},
  ) => (
    <Tooltip label={extra.tooltip ?? label}>
      <Button
        size="sm"
        variant={extra.pressed ? "primary" : "tertiary"}
        accent={extra.pressed ? "default" : "neutral"}
        onClick={onClick}
        disabled={extra.disabled}
        aria-label={label}
        aria-pressed={extra.pressed}
        data-testid={testId}
        leftSection={<Icon name={icon} size={20} />}
      />
    </Tooltip>
  );
  const insertButton = (
    label: string,
    icon: Parameters<typeof Icon>[0]["name"],
    onClick: () => void,
    testId: string,
    extra: { armed?: boolean; disabled?: boolean; tooltip: string },
  ) => (
    <Tooltip label={extra.tooltip}>
      <Button
        size="sm"
        variant={extra.armed ? "primary" : "secondary"}
        accent={extra.armed ? "default" : "neutral"}
        onClick={onClick}
        disabled={extra.disabled}
        aria-pressed={extra.armed}
        data-testid={testId}
        leftSection={<Icon name={icon} size={16} />}
        style={{ flex: 1, minWidth: 0, paddingInline: "0.5rem" }}
      >
        {label}
      </Button>
    </Tooltip>
  );

  return (
    <Box px="sm" pt="xs" pb={6} data-testid="pdf-editor-panel-tools">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap={2}>
          <Group gap={2} wrap="nowrap">
            {iconButton(
              t("pdfTextEditor.toolbar.undo", "Undo"),
              "undo-2",
              () => store.undo(),
              "pdf-editor-undo",
              {
                disabled: !history.canUndo,
                tooltip: t("pdfTextEditor.toolbar.undoTooltip", {
                  defaultValue: "Undo ({{shortcut}})",
                  shortcut: modShortcut("Z"),
                }),
              },
            )}
            {iconButton(
              t("pdfTextEditor.toolbar.redo", "Redo"),
              "redo-2",
              () => store.redo(),
              "pdf-editor-redo",
              {
                disabled: !history.canRedo,
                tooltip: t("pdfTextEditor.toolbar.redoTooltip", {
                  defaultValue: "Redo ({{shortcut}})",
                  shortcut: modShortcut("Y"),
                }),
              },
            )}
          </Group>
          <Group gap={2} wrap="nowrap">
            {iconButton(
              t("pdfTextEditor.settings.find", "Find in document"),
              "search",
              onOpenFind,
              "pdf-editor-open-find",
              {
                pressed: state.findOpen,
                tooltip: t("pdfTextEditor.settings.findTooltip", {
                  defaultValue: "Find ({{shortcut}})",
                  shortcut: modShortcut("F"),
                }),
              },
            )}
            {iconButton(
              t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts"),
              "circle-question-mark",
              onShowHelp,
              "pdf-editor-help",
              {
                tooltip: t(
                  "pdfTextEditor.help.tooltip",
                  "Keyboard shortcuts (?)",
                ),
              },
            )}
          </Group>
        </Group>
        <SectionLabel>
          {t("pdfTextEditor.panelTools.insert", "Insert")}
        </SectionLabel>
        <Group gap={6} wrap="nowrap">
          {insertButton(
            t("pdfTextEditor.sidebar.text", "Text"),
            "type",
            () => store.toggleMode("addText"),
            "pdf-editor-add-text",
            {
              armed: addTextArmed,
              tooltip: addTextArmed
                ? t(
                    "pdfTextEditor.sidebar.clickPageToAddText",
                    "Click page to add text",
                  )
                : t(
                    "pdfTextEditor.toolbar.addTextTooltip",
                    "Add a text box - then click the page",
                  ),
            },
          )}
          {insertButton(
            t("pdfTextEditor.sidebar.table", "Table"),
            "table",
            () => store.toggleMode("addTable"),
            "pdf-editor-add-table",
            {
              armed: addTableArmed,
              tooltip: addTableArmed
                ? t(
                    "pdfTextEditor.sidebar.clickPageToAddTable",
                    "Click page to add a table",
                  )
                : t("pdfTextEditor.sidebar.addTable", "Add table"),
            },
          )}
          {insertButton(
            t("pdfTextEditor.sidebar.image", "Image"),
            "image",
            () => session?.pickImage(),
            "pdf-editor-add-image",
            {
              disabled: !session,
              tooltip: t("pdfTextEditor.sidebar.addImage", "Add image"),
            },
          )}
        </Group>
      </Stack>
    </Box>
  );
}
