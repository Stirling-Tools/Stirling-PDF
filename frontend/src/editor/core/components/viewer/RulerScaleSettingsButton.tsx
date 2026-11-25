import { useState } from "react";
import { Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Tooltip, type TooltipProps } from "@editor/components/shared/Tooltip";
import { ScaleSettingsPanel } from "@editor/components/viewer/ScaleSettingsPanel";
import type { MeasureScale } from "@editor/utils/measurementTypes";

interface RulerScaleSettingsButtonProps {
  disabled?: boolean;
  label: string;
  tooltipPosition: NonNullable<TooltipProps["position"]>;
  currentScale?: MeasureScale | null;
  onApplyScale?: (scale: MeasureScale) => void;
  onResetScale?: () => void;
  onStartCalibration?: () => void;
  onCancelCalibration?: () => void;
  isCalibrationActive?: boolean;
}

/** A small chevron beside the ruler that opens its scale settings. */
export function RulerScaleSettingsButton({
  disabled,
  label,
  tooltipPosition,
  currentScale,
  onApplyScale,
  onResetScale,
  onStartCalibration,
  onCancelCalibration,
  isCalibrationActive,
}: RulerScaleSettingsButtonProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const scale = currentScale
    ? currentScale.ratio
      ? `1:${currentScale.ratio}`
      : currentScale.unit
    : t("workbenchBar.rulerScaleUnset", "Not set");
  // The chevron has no room for the scale, so its name carries it.
  const name = `${label}: ${scale}`;

  return (
    <Tooltip content={name} position={tooltipPosition} arrow>
      {/* Popover.Target is the button, so its popup state is announced there. */}
      <span className="viewer-ruler-scale">
        <Popover
          opened={opened}
          onChange={setOpened}
          position={tooltipPosition}
          withArrow
          shadow="md"
          offset={8}
          withinPortal
          // The panel is a form: focus moves into it, so Escape reaches it.
          trapFocus
          returnFocus
        >
          <Popover.Target>
            <ActionIcon
              variant="tertiary"
              size="sm"
              className="viewer-ruler-scale__toggle"
              disabled={disabled}
              aria-label={name}
              onClick={() => setOpened((open) => !open)}
              data-testid="viewer-ruler-scale"
            >
              <Icon
                name={
                  tooltipPosition === "bottom" ? "chevron-down" : "chevron-up"
                }
                size={14}
              />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <ScaleSettingsPanel
              currentScale={currentScale}
              onApplyScale={(next) => onApplyScale?.(next)}
              onResetScale={() => onResetScale?.()}
              onStartCalibration={onStartCalibration}
              onCancelCalibration={onCancelCalibration}
              isCalibrationActive={isCalibrationActive}
              onClose={() => setOpened(false)}
            />
          </Popover.Dropdown>
        </Popover>
      </span>
    </Tooltip>
  );
}
