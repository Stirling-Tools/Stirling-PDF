import { TextInput, Text, Flex, Switch } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { usePageSelectionTips } from "@editor/components/tooltips/usePageSelectionTips";
import classes from "@editor/components/shared/pageSelection/BulkSelectionPanel.module.css";

interface PageSelectionInputProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  onUpdatePagesFromCSV: (override?: string) => void;
  onClear: () => void;
  advancedOpened?: boolean;
  onToggleAdvanced?: (v: boolean) => void;
}

const PageSelectionInput = ({
  csvInput,
  setCsvInput,
  onUpdatePagesFromCSV,
  onClear,
  advancedOpened,
  onToggleAdvanced,
}: PageSelectionInputProps) => {
  const { t } = useTranslation();
  const pageSelectionTips = usePageSelectionTips();

  return (
    <div className={classes.panelGroup}>
      {/* Header row with tooltip/title and advanced toggle */}
      <Flex justify="space-between" align="center" mb="sm">
        <InfoTooltip
          title={pageSelectionTips.header?.title}
          tips={pageSelectionTips.tips}
          ariaLabel={t("bulkSelection.pageSelection.title", "Page Selection")}
          position="left"
          width={400}
        >
          <button type="button" className="sui-info-trigger-label">
            <Icon
              name="shield-alert"
              size="1rem"
              style={{ color: "var(--c-accent-fg)" }}
            />
            <Text component="span">
              {t("bulkSelection.pageSelection.title", "Page Selection")}
            </Text>
          </button>
        </InfoTooltip>
        {typeof advancedOpened === "boolean" && (
          <Flex align="center" gap="xs">
            <Text size="sm" c="var(--c-text-muted)">
              {t("bulkSelection.advanced.title", "Advanced")}
            </Text>
            <Switch
              size="sm"
              checked={!!advancedOpened}
              onChange={(e) => onToggleAdvanced?.(e.currentTarget.checked)}
              title={t("bulkSelection.advanced.title", "Advanced")}
              className={classes.advancedSwitch}
            />
          </Flex>
        )}
      </Flex>

      <TextInput
        value={csvInput}
        onChange={(e) => {
          const next = e.target.value;
          setCsvInput(next);
          onUpdatePagesFromCSV(next);
        }}
        placeholder="1,3,5-10"
        rightSection={
          csvInput && (
            <ActionIcon
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={onClear}
              aria-label={t("clear", "Clear")}
            >
              &times;
            </ActionIcon>
          )
        }
        onKeyDown={(e) => e.key === "Enter" && onUpdatePagesFromCSV()}
        className={classes.textInput}
      />
    </div>
  );
};

export default PageSelectionInput;
