import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, Text } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import {
  stampTextExamples,
  stampVariableGroups,
} from "@editor/components/tools/addStamp/stampVariables";
import classes from "@editor/components/tools/addStamp/StampVariablePicker.module.css";

interface StampVariablePickerProps {
  /** Adds one variable to the stamp text; the popover stays open for the next. */
  onInsert: (token: string) => void;
  /** Replaces the whole stamp text with an example. */
  onUseExample: (text: string) => void;
  /** Opens the field's sidebar help, which explains every variable. */
  onShowHelp: () => void;
  disabled?: boolean;
}

/**
 * Icon button for the Stamp Text label row. Sits absolutely at the top right of
 * the nearest positioned ancestor, so wrap the field in one.
 */
export function StampVariablePicker({
  onInsert,
  onUseExample,
  onShowHelp,
  disabled = false,
}: StampVariablePickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const label = t("AddStampRequest.variablePicker.open", "Insert a variable");

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-end"
      withArrow
      shadow="md"
      width={300}
      zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
      trapFocus
      returnFocus
    >
      <Tooltip content={label} position="top" disabled={opened}>
        <span className={classes.trigger}>
          <Popover.Target>
            <ActionIcon
              variant="quiet"
              size="sm"
              aria-label={label}
              aria-expanded={opened}
              aria-haspopup="dialog"
              disabled={disabled}
              onClick={() => setOpened((open) => !open)}
            >
              <Icon name="variable" size={16} />
            </ActionIcon>
          </Popover.Target>
        </span>
      </Tooltip>
      <Popover.Dropdown aria-label={label} className={classes.dropdown}>
        <div className={classes.groups}>
          {stampVariableGroups(t).map((group) => (
            <section key={group.title} aria-label={group.title}>
              <Text size="xs" fw={600} c="dimmed">
                {group.title}
              </Text>
              <div className={classes.tokens}>
                {group.variables
                  .flatMap((variable) => variable.tokens)
                  .map((token) => (
                    <Button
                      key={token}
                      variant="secondary"
                      size="sm"
                      className={classes.token}
                      onClick={() => onInsert(token)}
                    >
                      {token}
                    </Button>
                  ))}
              </div>
            </section>
          ))}
          <section aria-label={t("AddStampRequest.examples", "Examples")}>
            <Text size="xs" fw={600} c="dimmed">
              {t("AddStampRequest.examples", "Examples")}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "AddStampRequest.variablePicker.examplesHint",
                "Replaces the stamp text",
              )}
            </Text>
            <div className={classes.examples}>
              {stampTextExamples(t).map((example) => (
                <Button
                  key={example.text}
                  variant="secondary"
                  size="sm"
                  justify="start"
                  fullWidth
                  className={classes.token}
                  onClick={() => {
                    onUseExample(example.text);
                    setOpened(false);
                  }}
                >
                  {example.label}
                </Button>
              ))}
            </div>
          </section>
        </div>
        <div className={classes.footer}>
          <Button
            variant="tertiary"
            size="sm"
            leftSection={<Icon name="info" size={14} />}
            onClick={() => {
              setOpened(false);
              onShowHelp();
            }}
          >
            {t(
              "AddStampRequest.variablePicker.help",
              "What each variable means",
            )}
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
