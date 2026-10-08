import { useRef } from "react";
import { Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { type TooltipProps } from "@app/components/shared/Tooltip";
import { BarButton } from "@app/components/viewer/ViewerBarControls";
import { ScaleSettingsPanel } from "@app/components/viewer/ScaleSettingsPanel";
import type { MeasureScale } from "@app/utils/measurementTypes";

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
          icon="ruler"
          label={label}
          hint={t(
            "workbenchBar.rulerScaleHint",
            "Set what distances on the page equal in real life, so the ruler measures in metres, feet and so on",
          )}
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
          testId="viewer-ruler-scale"
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
