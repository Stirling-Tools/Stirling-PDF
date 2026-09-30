import { useRenderCount } from "@app/hooks/useRenderCount";
import { COLOUR_PICKER_RENDER_LABEL } from "@app/constants/renderLabels";
import {
  Tooltip,
  Popover,
  Stack,
  ColorSwatch,
  ColorPicker as MantineColorPicker,
  Group,
} from "@mantine/core";
import { memo, useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";

// safari and firefox do not support the eye dropper API, only edge, chrome and opera do.
// the button is hidden in the UI if the API is not supported.
const supportsEyeDropper =
  typeof window !== "undefined" && "EyeDropper" in window;

const SWATCHES = [
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
];

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

/**
 * Mantine memoises nothing inside ColorPicker, so every render of an ancestor
 * recomputes each swatch and its luminance. The annotation menu sits under a
 * viewer that re-renders dozens of times while it re-lays out — opening the
 * Annotate panel, a zoom change — and rebuilding the palette each time reads as
 * flicker. Keying on the colour alone keeps those renders off the swatches; the
 * callbacks are read through a ref so their identity is not part of the compare.
 */
const Picker = memo(function Picker({
  value,
  onChange,
  onChangeEnd,
}: {
  value: string;
  onChange: (color: string) => void;
  onChangeEnd: (color: string) => void;
}) {
  useRenderCount(COLOUR_PICKER_RENDER_LABEL);
  return (
    <MantineColorPicker
      format="hex"
      value={value}
      onChange={onChange}
      onChangeEnd={onChangeEnd}
      swatches={SWATCHES}
      swatchesPerRow={5}
      size="sm"
    />
  );
});

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
  // Latest-callback refs: keeps Picker memoised while the parent's handlers
  // change identity on every viewer re-render.
  const handlersRef = useRef({ onChange, setLocalColor });
  handlersRef.current = { onChange, setLocalColor };
  const stableSetLocalColor = useCallback((color: string) => {
    handlersRef.current.setLocalColor(color);
  }, []);
  const stableOnChange = useCallback((color: string) => {
    handlersRef.current.onChange(color);
  }, []);
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
            <ColorSwatch color={localColor} size={18} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Picker
            value={localColor}
            onChange={stableSetLocalColor}
            onChangeEnd={stableOnChange}
          />
          {supportsEyeDropper && (
            <Group justify="flex-end">
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
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
