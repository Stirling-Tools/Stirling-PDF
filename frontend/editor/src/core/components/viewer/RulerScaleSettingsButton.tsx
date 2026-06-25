import { useRef } from "react";
import { ActionIcon, Popover } from "@mantine/core";
import SettingsIcon from "@mui/icons-material/Settings";
import { Tooltip, type TooltipProps } from "@app/components/shared/Tooltip";
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
        <div style={{ display: "inline-flex" }}>
          <Tooltip
            content={label}
            position={tooltipPosition}
            offset={12}
            arrow
            portalTarget={document.body}
          >
            <ActionIcon
              ref={scalePopoverRef}
              variant="filled"
              color="blue"
              radius="md"
              className="right-rail-icon"
              disabled={disabled}
              aria-label={label}
            >
              <SettingsIcon sx={{ fontSize: "1.5rem" }} />
            </ActionIcon>
          </Tooltip>
        </div>
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
