import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Dropdown } from "@app/ui";
import {
  PIPELINE_ICON_KEYS,
  pipelineIcon,
} from "@portal/components/pipelines/pipelineIcon";
import "@portal/components/pipelines/PipelineIconPicker.css";

interface PipelineIconPickerProps {
  /** Current icon key (may be a category id or empty; resolved by pipelineIcon). */
  value: string;
  onChange: (key: string) => void;
}

/** Picks the pipeline's icon from a small set. The chosen glyph is the trigger; the menu is a grid. */
export function PipelineIconPicker({
  value,
  onChange,
}: PipelineIconPickerProps) {
  const { t } = useTranslation();
  // Controlled so a grid button (not a Dropdown.Item) can close the menu on pick.
  const [open, setOpen] = useState(false);

  function pick(key: string) {
    onChange(key);
    setOpen(false);
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} align="start">
      <Dropdown.Trigger>
        <ActionIcon
          variant="secondary"
          size="sm"
          aria-label={t("portal.pipelines.builder.icon.label")}
        >
          {pipelineIcon(value, "1.125rem")}
        </ActionIcon>
      </Dropdown.Trigger>
      <Dropdown.Menu>
        <div className="portal-icon-picker__grid">
          {PIPELINE_ICON_KEYS.map((key) => {
            const selected = key === value;
            return (
              <button
                key={key}
                type="button"
                className={
                  "portal-icon-picker__option" +
                  (selected ? " portal-icon-picker__option--selected" : "")
                }
                aria-label={key}
                aria-pressed={selected}
                onClick={() => pick(key)}
              >
                {pipelineIcon(key, "1.25rem")}
              </button>
            );
          })}
        </div>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
