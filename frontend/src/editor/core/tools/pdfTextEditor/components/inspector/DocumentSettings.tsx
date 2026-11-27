import { Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@editor/ui/Checkbox";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { Field } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type {
  GroupingMode,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

/** Rulers and alignment guides over the pages. */
export function RulersSetting({
  showRulers,
  onSetShowRulers,
}: {
  showRulers: boolean;
  onSetShowRulers: (show: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Checkbox
      checked={showRulers}
      onChange={(e) => onSetShowRulers(e.currentTarget.checked)}
      label={t("pdfTextEditor.sidebar.rulers", "Rulers and guides")}
      data-testid="pdf-editor-toggle-rulers"
    />
  );
}

/**
 * How the document is read and how new text boxes size. Switching grouping
 * reloads the document and discards undo history, so both sit behind
 * Advanced, where nobody flips one by accident, with the consequence behind
 * each control's (i).
 */
export function ReadingSettings({
  groupingMode,
  widthMode,
  onSetGroupingMode,
  onSetWidthMode,
}: {
  groupingMode: GroupingMode;
  widthMode: WidthMode;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field
        label={t("pdfTextEditor.sidebar.textGrouping", "Text grouping")}
        hint={t(
          "pdfTextEditor.sidebar.groupingAutoHint",
          "Groups equal-spaced lines into paragraphs. Changing this re-reads the document and clears undo history.",
        )}
        testId="pdf-editor-grouping-mode"
      >
        <Box data-testid="pdf-editor-grouping-mode-control">
          <SegmentedControl
            size="xs"
            fullWidth
            value={groupingMode}
            onChange={onSetGroupingMode}
            options={[
              {
                label: t("pdfTextEditor.sidebar.groupingAuto", "Auto"),
                value: "auto",
              },
              {
                label: t("pdfTextEditor.sidebar.groupingLine", "Line"),
                value: "line",
              },
            ]}
          />
        </Box>
      </Field>
      <Field
        label={t("pdfTextEditor.sidebar.textBoxWidth", "New text box width")}
        hint={t(
          "pdfTextEditor.sidebar.widthGrowHint",
          "Grow widens a box as you type; Wrap keeps its width and flows onto new lines.",
        )}
        testId="pdf-editor-width-mode"
      >
        <Box data-testid="pdf-editor-width-mode-control">
          <SegmentedControl
            size="xs"
            fullWidth
            value={widthMode}
            onChange={onSetWidthMode}
            options={[
              {
                label: t("pdfTextEditor.sidebar.widthGrow", "Grow"),
                value: "grow",
              },
              {
                label: t("pdfTextEditor.sidebar.widthWrap", "Wrap"),
                value: "wrap",
              },
            ]}
          />
        </Box>
      </Field>
    </>
  );
}
