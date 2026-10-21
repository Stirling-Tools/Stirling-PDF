import { Box, Group, Radio, Text } from "@mantine/core";
import { Icon, type IconName } from "@app/ui/Icon";
import classes from "@app/components/shared/ChoiceRow.module.css";

export interface ChoiceRowProps<T extends string> {
  value: T;
  icon: IconName;
  label: string;
  description: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * One row in a single-select choice list. Renders a radio card so the group
 * keeps native keyboard semantics; the selected state is drawn, not coloured.
 */
export function ChoiceRow<T extends string>({
  value,
  icon,
  label,
  description,
  disabled = false,
  testId,
}: ChoiceRowProps<T>) {
  return (
    <Radio.Card
      value={value}
      className={classes.row}
      disabled={disabled}
      data-testid={testId}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box className={classes.icon}>
          {typeof icon === "string" ? (
            <Icon name={icon} size="0.9375rem" />
          ) : (
            icon
          )}
        </Box>
        <Box className={classes.text}>
          <Text className={classes.title}>{label}</Text>
          <Text className={classes.description}>{description}</Text>
        </Box>
      </Group>
    </Radio.Card>
  );
}
