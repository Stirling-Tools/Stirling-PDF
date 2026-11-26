import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Popover, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import classes from "@editor/components/tools/addPageNumbers/PageNumberVariablePicker.module.css";

interface PageNumberVariablePickerProps {
  /** Adds one variable to the custom text; the popover stays open for the next. */
  onInsert: (token: string) => void;
  disabled?: boolean;
}

/**
 * Lists the variables the custom text accepts, beside the field's label. Sits
 * absolutely at the top right of the nearest positioned ancestor, so wrap the
 * field in one. Same placement as the Stamp tool's variable picker.
 */
export function PageNumberVariablePicker({
  onInsert,
  disabled = false,
}: PageNumberVariablePickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const label = t("addPageNumbers.variablesButton", "Variables");
  const variables = [
    {
      token: "{n}",
      description: t("addPageNumbers.variables.n", "Page number"),
    },
    {
      token: "{total}",
      description: t(
        "addPageNumbers.variables.total",
        "Number of pages in the file",
      ),
    },
    {
      token: "{filename}",
      description: t(
        "addPageNumbers.variables.filename",
        "File name without the extension",
      ),
    },
  ];

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
      <span className={classes.trigger}>
        <Popover.Target>
          <Button
            variant="secondary"
            size="sm"
            fontSize="xs"
            px="xs"
            // The label line's height, so the button sits beside the label, not over the field.
            style={{ "--button-height": "1.5rem" } as CSSProperties}
            aria-expanded={opened}
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={() => setOpened((open) => !open)}
          >
            {label}
          </Button>
        </Popover.Target>
      </span>
      <Popover.Dropdown aria-label={label} className={classes.dropdown}>
        <div className={classes.rows}>
          {variables.map(({ token, description }) => (
            <div key={token} className={classes.row}>
              <Button
                variant="secondary"
                size="sm"
                className={classes.token}
                onClick={() => onInsert(token)}
              >
                {token}
              </Button>
              <Text size="xs" c="dimmed">
                {description}
              </Text>
            </div>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
