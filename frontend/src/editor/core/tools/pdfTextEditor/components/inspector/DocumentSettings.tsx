import { useState } from "react";
import { Box, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";
import { SpellcheckControl } from "@editor/tools/pdfTextEditor/components/SpellcheckControl";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import { Field } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type {
  GroupingMode,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

/*
 * Document-level preferences, split by how often they are touched.
 *
 * View toggles are everyday and sit in plain sight. The two parse options are
 * not: they change how the document was read, and switching grouping reloads
 * it and discards undo history - so they go behind a disclosure where nobody
 * flips one by accident, with the consequence behind the control's (i).
 */

/** The everyday view toggles. */
export function ViewSettings({
  showRulers,
  onSetShowRulers,
}: {
  showRulers: boolean;
  onSetShowRulers: (show: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm" data-testid="pdf-editor-view-settings">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {/* The row's own text names the switch; passing `label` too would
            print it twice, once either side of the control. */}
        <Text size="sm" id="pdf-editor-rulers-label">
          {t("pdfTextEditor.sidebar.rulers", "Rulers and guides")}
        </Text>
        <ToggleSwitch
          size="sm"
          checked={showRulers}
          onChange={onSetShowRulers}
          aria-labelledby="pdf-editor-rulers-label"
          data-testid="pdf-editor-toggle-rulers"
        />
      </Group>
      <SpellcheckControl />
    </Stack>
  );
}

/** How the document is read and how new text boxes size. */
export function AdvancedSettings({
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div data-testid="pdf-editor-advanced-settings">
      <ToolStep
        title={t("pdfTextEditor.settings.advanced", "Advanced")}
        showNumber={false}
        isCollapsed={!advancedOpen}
        onCollapsedClick={() => setAdvancedOpen((v) => !v)}
        headerTestId="pdf-editor-advanced-toggle"
      >
        <Stack gap="md">
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
            label={t(
              "pdfTextEditor.sidebar.textBoxWidth",
              "New text box width",
            )}
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
        </Stack>
      </ToolStep>
    </div>
  );
}
