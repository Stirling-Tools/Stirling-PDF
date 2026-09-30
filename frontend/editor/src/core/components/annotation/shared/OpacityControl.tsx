import { Tooltip, Popover, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { ValueSlider } from "@app/components/annotation/shared/ValueSlider";
import { useStableHandler } from "@app/components/annotation/shared/useStableHandler";

interface OpacityControlProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function OpacityControl({
  value,
  onChange,
  disabled = false,
}: OpacityControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const handleChange = useStableHandler(onChange);

  return (
    <Popover opened={opened} onChange={setOpened} position="top" withArrow>
      <Popover.Target>
        <Tooltip label={t("annotation.opacity", "Opacity")} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            aria-label={t("annotation.opacity", "Opacity")}
          >
            <Icon name="droplet" size={18} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" style={{ minWidth: 150 }}>
          <Text size="xs" fw={500}>
            {t("annotation.opacity", "Opacity")}
          </Text>
          <ValueSlider
            value={value}
            min={10}
            max={100}
            onChange={handleChange}
            suffix="%"
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
