import { Box, Text } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import classes from "@app/components/shared/OutcomePanel.module.css";

export interface OutcomePanelProps {
  tone: "info" | "danger";
  title?: string;
  detail?: string;
  testId?: string;
}

/**
 * The one-line promise under a tool's settings. Stays mounted without text so
 * the live region exists before the result that gets announced into it.
 */
export function OutcomePanel({
  tone,
  title,
  detail,
  testId,
}: OutcomePanelProps) {
  const empty = !title;

  return (
    <Box
      className={classes.panel}
      data-tone={tone}
      data-empty={empty ? true : undefined}
      data-testid={testId}
    >
      <Box className={classes.icon}>
        {!empty && (
          <Icon
            name={tone === "danger" ? "circle-alert" : "info"}
            size="0.9375rem"
          />
        )}
      </Box>
      <Box
        className={classes.body}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {!empty && (
          <>
            <Text className={classes.title}>{title}</Text>
            {detail && <Text className={classes.detail}>{detail}</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}
