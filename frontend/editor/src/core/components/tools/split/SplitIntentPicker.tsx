import { Box, Group, Radio, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import {
  SPLIT_INTENTS,
  type SplitIntentId,
} from "@app/constants/splitConstants";
import classes from "@app/components/tools/split/SplitIntentPicker.module.css";

interface SplitIntentPickerProps {
  value: SplitIntentId | null;
  onChange: (intent: SplitIntentId) => void;
  disabled?: boolean;
}

/**
 * Four goal cards, not eight technique rows: every split method belongs to
 * exactly one goal, and the goal's methods become the variant switch in the
 * settings step. Native radio semantics, so arrow keys move between goals.
 */
export function SplitIntentPicker({
  value,
  onChange,
  disabled = false,
}: SplitIntentPickerProps) {
  const { t } = useTranslation();

  return (
    <Radio.Group
      value={value ?? ""}
      onChange={(next) => onChange(next as SplitIntentId)}
      aria-label={t("split.intent.groupLabel", "Choose how to split")}
    >
      <Stack gap="xs">
        {SPLIT_INTENTS.map((intent) => (
          <Radio.Card
            key={intent.id}
            value={intent.id}
            className={classes.card}
            disabled={disabled}
            data-testid={`split-intent-${intent.id}`}
          >
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <Box className={classes.icon}>
                <Icon name={intent.icon} size="1rem" />
              </Box>
              <Box className={classes.text}>
                <Text className={classes.title}>{t(intent.titleKey)}</Text>
                <Text className={classes.description}>
                  {t(intent.descriptionKey)}
                </Text>
              </Box>
            </Group>
          </Radio.Card>
        ))}
      </Stack>
    </Radio.Group>
  );
}
