import { useRef } from "react";
import { Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { type TooltipProps } from "@editor/components/shared/Tooltip";
import { BarButton } from "@editor/components/viewer/ViewerBarControls";
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
  const scalePopoverRef = useRef<HTMLButtonElement>(null);

  return (
    <Popover
      position={tooltipPosition}
      withArrow
      shadow="md"
      offset={8}
      withinPortal
    >
      <Popover.Target>
        <BarButton
          ref={scalePopoverRef}
          icon="settings"
          label={label}
          tooltipPosition={tooltipPosition}
          disabled={disabled}
          trailing={
            <span className="viewer-bar-scale-value">
              {currentScale
                ? currentScale.ratio
                  ? `1:${currentScale.ratio}`
                  : currentScale.unit
                : t("workbenchBar.rulerScaleUnset", "Not set")}
            </span>
          }
        />
      </Popover.Target>
      <Popover.Dropdown>
        <ScaleSettingsPanel
          currentScale={currentScale}
          onApplyScale={(scale) => {
            onApplyScale?.(scale);
          }}
          onResetScale={() => {
            onResetScale?.();
          }}
          onStartCalibration={onStartCalibration}
          onCancelCalibration={onCancelCalibration}
          isCalibrationActive={isCalibrationActive}
          onClose={() => {
            scalePopoverRef.current?.click();
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
