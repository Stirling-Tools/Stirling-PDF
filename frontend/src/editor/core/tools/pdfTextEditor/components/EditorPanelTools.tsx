import { Box, Group } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { SectionLabel } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

interface Props {
  store: EditorStore;
  state: EditorViewState;
}

/** Adding text, a table or an image, at the head of the editor's side panel. */
export function EditorPanelTools({ store, state }: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const addTextArmed = state.mode === "addText";
  const addTableArmed = state.mode === "addTable";
  const noDocument = !state.hasDocument;
  const insertButton = (
    label: string,
    icon: IconName,
    onClick: () => void,
    testId: string,
    extra: { armed?: boolean; disabled?: boolean; tooltip: string },
  ) => (
    <Tooltip position="top" content={extra.tooltip}>
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
    <Box px="md" pt="xs" pb="sm" data-testid="pdf-editor-panel-tools">
      <SectionLabel>
        {t("pdfTextEditor.sidebar.addToPage", "Add to page")}
      </SectionLabel>
      <Group gap={6} wrap="nowrap">
        {insertButton(
          t("pdfTextEditor.sidebar.text", "Text"),
          "type",
          () => store.toggleMode("addText"),
          "pdf-editor-add-text",
          {
            armed: addTextArmed,
            disabled: noDocument,
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
            disabled: noDocument,
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
            disabled: !session || noDocument,
            tooltip: t("pdfTextEditor.sidebar.addImage", "Add image"),
          },
        )}
      </Group>
    </Box>
  );
}
