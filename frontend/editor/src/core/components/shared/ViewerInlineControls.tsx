import React, { useState, useEffect } from "react";
import { ActionIcon, Slider } from "@mantine/core";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

/**
 * Compact zoom controls rendered inline in the WorkbenchBar when the current workbench is "viewer".
 */
export function ViewerInlineControls() {
  const { workbench } = useNavigationState();
  const viewer = useViewer();

  const [zoomPercent, setZoomPercent] = useState(100);

  useEffect(() => {
    const zoomState = viewer.getZoomState();
    setZoomPercent(zoomState.zoomPercent || 100);

    const unregister = viewer.registerImmediateZoomUpdate((pct) => {
      setZoomPercent(pct);
    });
    return () => unregister?.();
  }, [viewer.registerImmediateZoomUpdate]);

  if (workbench !== "viewer") return null;

  const sliderValue = Math.min(Math.max(zoomPercent, 20), 500);

  return (
    <div className="viewer-inline-controls">
      {/* Divider */}
      <div className="workbench-bar-divider" />

      {/* Zoom controls */}
      <ActionIcon
        variant="subtle"
        radius="md"
        className="workbench-bar-action-icon"
        onClick={() => viewer.zoomActions.zoomOut()}
        aria-label="Zoom out"
      >
        <ZoomOutIcon sx={{ fontSize: "1rem" }} />
      </ActionIcon>

      <div className="viewer-inline-controls__slider-wrap">
        <Slider
          value={sliderValue}
          min={20}
          max={500}
          step={5}
          onChange={(val) => {
            viewer.zoomActions.setZoomLevel?.(val / 100);
          }}
          size="xs"
          styles={{
            root: { width: "6rem" },
            thumb: { width: 14, height: 14 },
            track: { height: 3 },
          }}
          label={null}
        />
      </div>

      <ActionIcon
        variant="subtle"
        radius="md"
        className="workbench-bar-action-icon"
        onClick={() => viewer.zoomActions.zoomIn()}
        aria-label="Zoom in"
      >
        <ZoomInIcon sx={{ fontSize: "1rem" }} />
      </ActionIcon>

      <span className="viewer-inline-controls__zoom-pct">
        {Math.round(zoomPercent)}%
      </span>
    </div>
  );
}
