import {
  Tooltip,
  Popover,
  Stack,
  ColorSwatch,
  ColorPicker as MantineColorPicker,
  Group,
} from "@mantine/core";
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ColorizeIcon from "@mui/icons-material/Colorize";
import { Button } from "@shared/components/Button";

// safari and firefox do not support the eye dropper API, only edge, chrome and opera do.
// the button is hidden in the UI if the API is not supported.
const supportsEyeDropper =
  typeof window !== "undefined" && "EyeDropper" in window;

interface EyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}
declare const EyeDropper: { new (): EyeDropper };

interface ColorControlProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
  disabled?: boolean;
}

export function ColorControl({
  value,
  onChange,
  label,
  disabled = false,
}: ColorControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  // Buffer the colour locally so the picker stays responsive during drag.
  // Only propagate to the parent (which triggers expensive annotation updates)
  // on onChangeEnd (mouse-up / swatch click), preventing infinite re-render loops.
  const [localColor, setLocalColor] = useState(value);
  useEffect(() => {
    setLocalColor(value);
  }, [value]);

  const handleEyeDropper = useCallback(async () => {
    if (!supportsEyeDropper) return;
    try {
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex);
    } catch {
      // User cancelled or browser error — no-op
    }
  }, [onChange]);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom"
      withArrow
      withinPortal
    >
      <Popover.Target>
        <Tooltip label={label}>
          <Button
            aria-label={label}
            variant="secondary"
            accent="neutral"
            size="md"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            leftSection={<ColorSwatch color={localColor} size={18} />}
          />
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <MantineColorPicker
            format="hex"
            value={localColor}
            onChange={setLocalColor}
            onChangeEnd={onChange}
            swatches={[
              "#000000",
              "#ffffff",
              "#ff0000",
              "#00ff00",
              "#0000ff",
              "#ffff00",
              "#ff00ff",
              "#00ffff",
              "#ffa500",
              "transparent",
            ]}
            swatchesPerRow={5}
            size="sm"
          />
          {supportsEyeDropper && (
            <Group justify="flex-end">
              <Tooltip
                label={t("color.eyeDropper.tooltip", "Pick colour from screen")}
              >
                <Button
                  aria-label={t(
                    "color.eyeDropper.tooltip",
                    "Pick colour from screen",
                  )}
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  onClick={handleEyeDropper}
                  leftSection={<ColorizeIcon style={{ fontSize: 16 }} />}
                />
              </Tooltip>
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
