import { useState } from "react";
import { Box, Collapse, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { ToggleSwitch } from "@app/ui/ToggleSwitch";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { SpellcheckControl } from "@app/tools/pdfTextEditor/v2/components/SpellcheckControl";
import {
  Section,
  SectionLabel,
} from "@app/tools/pdfTextEditor/v2/components/inspector/InspectorPrimitives";
import type {
  GroupingMode,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";

interface Props {
  groupingMode: GroupingMode;
  widthMode: WidthMode;
  showRulers: boolean;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
  onSetShowRulers: (show: boolean) => void;
}

/**
 * Document-level preferences, split by how often they are touched.
 *
 * View toggles are everyday and sit in plain sight. The two parse options are
 * not: they change how the document was read, and switching grouping reloads
 * it and discards undo history - so they go behind a disclosure where nobody
 * flips one by accident, with the consequence spelled out next to the control.
 */
export function DocumentSettings({
  groupingMode,
  widthMode,
  showRulers,
  onSetGroupingMode,
  onSetWidthMode,
  onSetShowRulers,
}: Props) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <>
      <Section testId="v2-view-settings">
        <SectionLabel>
          {t("pdfTextEditorV2.settings.view", "View")}
        </SectionLabel>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            {/* The row's own text names the switch; passing `label` too would
                print it twice, once either side of the control. */}
            <Text size="xs" id="v2-rulers-label">
              {t("pdfTextEditorV2.sidebar.rulers", "Rulers and guides")}
            </Text>
            <ToggleSwitch
              size="sm"
              checked={showRulers}
              onChange={onSetShowRulers}
              aria-labelledby="v2-rulers-label"
              data-testid="v2-toggle-rulers"
            />
          </Group>
          <SpellcheckControl />
        </Stack>
      </Section>

      <Section testId="v2-advanced-settings">
        <Button
          variant="tertiary"
          accent="neutral"
          size="sm"
          fullWidth
          justify="between"
          px="none"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="v2-advanced-toggle"
          rightSection={
            advancedOpen ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )
          }
        >
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: "0.5px" }}
          >
            {t("pdfTextEditorV2.settings.advanced", "Advanced")}
          </Text>
        </Button>
        <Collapse in={advancedOpen}>
          <Stack gap="md" mt="sm">
            <Stack gap={4} data-testid="v2-grouping-mode">
              <Text size="xs" c="dimmed" fw={500}>
                {t("pdfTextEditorV2.sidebar.textGrouping", "Text grouping")}
              </Text>
              <Box data-testid="v2-grouping-mode-control">
                <SegmentedControl
                  size="xs"
                  fullWidth
                  value={groupingMode}
                  onChange={onSetGroupingMode}
                  options={[
                    {
                      label: t("pdfTextEditorV2.sidebar.groupingAuto", "Auto"),
                      value: "auto",
                    },
                    {
                      label: t("pdfTextEditorV2.sidebar.groupingLine", "Line"),
                      value: "line",
                    },
                  ]}
                />
              </Box>
              <Text size="xs" c="dimmed">
                {t(
                  "pdfTextEditorV2.sidebar.groupingAutoHint",
                  "Groups equal-spaced lines into paragraphs. Changing this re-reads the document and clears undo history.",
                )}
              </Text>
            </Stack>
            <Stack gap={4} data-testid="v2-width-mode">
              <Text size="xs" c="dimmed" fw={500}>
                {t(
                  "pdfTextEditorV2.sidebar.textBoxWidth",
                  "New text box width",
                )}
              </Text>
              <Box data-testid="v2-width-mode-control">
                <SegmentedControl
                  size="xs"
                  fullWidth
                  value={widthMode}
                  onChange={onSetWidthMode}
                  options={[
                    {
                      label: t("pdfTextEditorV2.sidebar.widthGrow", "Grow"),
                      value: "grow",
                    },
                    {
                      label: t("pdfTextEditorV2.sidebar.widthWrap", "Wrap"),
                      value: "wrap",
                    },
                  ]}
                />
              </Box>
              <Text size="xs" c="dimmed">
                {t(
                  "pdfTextEditorV2.sidebar.widthGrowHint",
                  "Grow widens a box as you type; Wrap keeps its width and flows onto new lines.",
                )}
              </Text>
            </Stack>
          </Stack>
        </Collapse>
      </Section>
    </>
  );
}
