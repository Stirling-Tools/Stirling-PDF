import { Radio, Stack } from "@mantine/core";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { ChoiceRow } from "@app/components/shared/ChoiceRow";
import classes from "@app/components/tools/split/SplitMethodPicker.module.css";
import type { SplitChoice, SplitMethod } from "@app/constants/splitConstants";

interface SplitMethodPickerProps {
  primary: SplitChoice[];
  more: SplitChoice[];
  value: SplitMethod;
  onChange: (method: SplitMethod) => void;
  disabled?: boolean;
}

/**
 * One question, three answers, and the rest behind a disclosure. Native radio
 * semantics, so arrow keys move between choices and the group is one tab stop.
 */
export function SplitMethodPicker({
  primary,
  more,
  value,
  onChange,
  disabled = false,
}: SplitMethodPickerProps) {
  const { t } = useTranslation();
  const inMore = more.some((choice) => choice.method === value);
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || inMore;
  const moreId = useId();

  const renderChoice = (choice: SplitChoice) => (
    <ChoiceRow
      key={choice.method}
      value={choice.method}
      icon={choice.icon}
      label={t(choice.labelKey)}
      description={t(choice.descriptionKey)}
      disabled={disabled}
      testId={`split-choice-${choice.method}`}
    />
  );

  return (
    <Stack gap={4}>
      <Radio.Group
        value={value}
        onChange={(next) => onChange(next as SplitMethod)}
        aria-label={t("split.choice.groupLabel", "How to split")}
      >
        <Stack gap={2}>
          {primary.map(renderChoice)}
          {showMore && (
            <div id={moreId} className={classes.moreGroup}>
              {more.map(renderChoice)}
            </div>
          )}
        </Stack>
      </Radio.Group>

      {/* While a disclosure-only choice is active the list stays open: hiding
          the selected row would leave its setting without a visible home. */}
      {more.length > 0 && !inMore && (
        <Button
          variant="quiet"
          size="sm"
          className={classes.more}
          onClick={() => setMoreOpen(!showMore)}
          aria-expanded={showMore}
          aria-controls={showMore ? moreId : undefined}
          rightSection={
            <Icon
              name={showMore ? "chevron-up" : "chevron-down"}
              size="0.875rem"
            />
          }
          data-testid="split-more-ways"
        >
          {showMore
            ? t("split.choice.less", "Fewer ways")
            : t("split.choice.more", "More ways to split")}
        </Button>
      )}
    </Stack>
  );
}
