import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import type { SplitIntent, SplitMethod } from "@app/constants/splitConstants";

interface SplitVariantPickerProps {
  intent: SplitIntent;
  method: SplitMethod;
  onChange: (method: SplitMethod) => void;
  disabled?: boolean;
}

/**
 * The chosen goal's methods as a switch, with one sentence explaining what the
 * selected one does. Only rendered when the goal has more than one method.
 */
export function SplitVariantPicker({
  intent,
  method,
  onChange,
  disabled = false,
}: SplitVariantPickerProps) {
  const { t } = useTranslation();

  const options = intent.methods.map((value) => ({
    value,
    label: t(intent.variantLabelKeys[value] ?? value, value),
  }));

  return (
    <Stack gap={6}>
      <div data-testid="split-variant">
        <SegmentedControl
          fullWidth
          size="sm"
          options={options}
          value={method}
          onChange={(next) => onChange(next)}
          disabled={disabled}
          ariaLabel={t("split.variant.groupLabel", "Choose a way to split")}
        />
      </div>
      <Text size="xs" c="dimmed" lh={1.4}>
        {t(`split.variantDescription.${method}`, "")}
      </Text>
    </Stack>
  );
}
