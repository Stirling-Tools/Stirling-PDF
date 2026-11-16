import {
  Tooltip,
  Popover,
  Stack,
  ColorSwatch,
  ColorPicker as MantineColorPicker,
  Group,
} from "@mantine/core";
import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";

// safari and firefox do not support the eye dropper API, only edge, chrome and opera do.
// the button is hidden in the UI if the API is not supported.
const supportsEyeDropper =
  typeof window !== "undefined" && "EyeDropper" in window;

interface EyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}
declare const EyeDropper: { new (): EyeDropper };

// Mantine's dark-scheme checkerboard is near-black and vanishes on dark
// surfaces; the light one reads as "transparent" in both schemes.
const LIGHT_CHECKERBOARD = {
  "--alpha-overlay-color": "var(--mantine-color-gray-3)",
  "--alpha-overlay-bg": "var(--mantine-color-white)",
} as CSSProperties;

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
        <Tooltip label={label} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            aria-label={label}
          >
            <ColorSwatch
              color={localColor}
              size={18}
              style={LIGHT_CHECKERBOARD}
            />
          </button>
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
            ]}
            swatchesPerRow={5}
            size="sm"
          />
          {/* Outside the picker's swatches: in hex format Mantine strips the
              alpha channel, so a "transparent" swatch there emits #000000. */}
          <Group justify="space-between">
            <Tooltip label={t("colorPicker.transparent", "Transparent")}>
              <ColorSwatch
                component="button"
                type="button"
                color="transparent"
                size={22}
                aria-label={t("colorPicker.transparent", "Transparent")}
                aria-pressed={localColor === "transparent"}
                withShadow={false}
                style={{
                  ...LIGHT_CHECKERBOARD,
                  cursor: "pointer",
                  border: "1px solid var(--c-border-strong)",
                }}
                onClick={() => {
                  setLocalColor("transparent");
                  onChange("transparent");
                }}
              />
            </Tooltip>
            {supportsEyeDropper && (
              <Tooltip
                label={t("color.eyeDropper.tooltip", "Pick colour from screen")}
              >
                <ActionIcon
                  aria-label={t(
                    "color.eyeDropper.tooltip",
                    "Pick colour from screen",
                  )}
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  onClick={handleEyeDropper}
                >
                  <Icon name="pipette" size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
