import { Divider, Group, Popover, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { ToggleSwitch } from "@app/ui/ToggleSwitch";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import { SpellcheckControl } from "@app/tools/pdfTextEditor/components/SpellcheckControl";
import { NO_SHRINK } from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import type {
  EditorStore,
  EditorViewState,
} from "@app/tools/pdfTextEditor/store/EditorStore";

/**
 * Editor preferences behind a gear in the top bar: set once and rarely
 * revisited, so they take no room in the panel.
 */
export function EditorSettingsMenu({
  store,
  state,
}: {
  store: EditorStore;
  state: EditorViewState;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.settings.title", "Editor settings");
  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Tooltip label={label}>
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            aria-label={label}
            data-testid="pdf-editor-settings"
            style={NO_SHRINK}
            leftSection={<Icon name="settings" size={20} />}
          />
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md" w={280} data-testid="pdf-editor-view-settings">
          <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm" id="pdf-editor-rulers-label">
                {t("pdfTextEditor.sidebar.rulers", "Rulers and guides")}
              </Text>
              <ToggleSwitch
                size="sm"
                checked={state.showRulers}
                onChange={(show) => store.setShowRulers(show)}
                aria-labelledby="pdf-editor-rulers-label"
                data-testid="pdf-editor-toggle-rulers"
              />
            </Group>
            <SpellcheckControl />
          </Stack>

          <Divider />

          <Stack gap={6} data-testid="pdf-editor-width-mode">
            <ButtonSelector
              label={t(
                "pdfTextEditor.sidebar.textBoxWidth",
                "New text box width",
              )}
              value={state.widthMode}
              onChange={(mode) => store.setWidthMode(mode)}
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
            <Text size="xs" c="dimmed">
              {t(
                "pdfTextEditor.sidebar.widthGrowHint",
                "Grow widens a box as you type; Wrap keeps its width and flows onto new lines.",
              )}
            </Text>
          </Stack>

          <Divider />

          <Stack gap={6} data-testid="pdf-editor-grouping-mode">
            <ButtonSelector
              label={t("pdfTextEditor.sidebar.textGrouping", "Text grouping")}
              value={state.groupingMode}
              onChange={(mode) => store.setGroupingMode(mode)}
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
            <Text size="xs" c="dimmed">
              {t(
                "pdfTextEditor.sidebar.groupingAutoHint",
                "Groups equal-spaced lines into paragraphs. Changing this re-reads the document and clears undo history.",
              )}
            </Text>
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
