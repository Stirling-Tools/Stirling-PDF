import { Tooltip, Popover, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { ValueSlider } from "@app/components/annotation/shared/ValueSlider";
import { useEventCallback } from "@app/hooks/useEventCallback";

interface WidthControlProps {
  value: number;
  onChange: (value: number) => void;
  min: number; // 1 for ink, 0 for shapes
  max: number; // 12 for ink, 20 for highlighter
  disabled?: boolean;
}

export function WidthControl({
  value,
  onChange,
  min,
  max,
  disabled = false,
}: WidthControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const handleChange = useEventCallback(onChange);

  return (
    <Popover opened={opened} onChange={setOpened} position="top" withArrow>
      <Popover.Target>
        <Tooltip label={t("annotation.width", "Width")} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            aria-label={t("annotation.width", "Width")}
          >
            <Icon name="line-weight" size={18} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" style={{ minWidth: 150 }}>
          <Text size="xs" fw={500}>
            {t("annotation.width", "Width")}
          </Text>
          <ValueSlider
            value={value}
            min={min}
            max={max}
            onChange={handleChange}
            suffix="pt"
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
