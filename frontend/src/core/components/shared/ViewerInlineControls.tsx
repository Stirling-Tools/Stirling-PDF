import React, { useState, useEffect } from "react";
import { ActionIcon, Slider } from "@mantine/core";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

/**
 * Compact page navigation and zoom controls rendered inline in the WorkbenchBar
 * when the current workbench is "viewer".
 */
export function ViewerInlineControls() {
  const { workbench } = useNavigationState();
  const viewer = useViewer();

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);

  useEffect(() => {
    const scrollState = viewer.getScrollState();
    setCurrentPage(scrollState.currentPage || 1);
    setTotalPages(scrollState.totalPages || 1);

    const unregister = viewer.registerImmediateScrollUpdate((page, total) => {
      setCurrentPage(page);
      setTotalPages(total);
    });
    return () => unregister?.();
  }, [viewer.registerImmediateScrollUpdate]);

  useEffect(() => {
    const zoomState = viewer.getZoomState();
    setZoomPercent(zoomState.zoomPercent || 100);

    const unregister = viewer.registerImmediateZoomUpdate((pct) => {
      setZoomPercent(pct);
    });
    return () => unregister?.();
  }, [viewer.registerImmediateZoomUpdate]);

  if (workbench !== "viewer") return null;

  const handlePrev = () => {
    if (currentPage > 1) viewer.scrollActions.scrollToPage(currentPage - 1);
  };
  const handleNext = () => {
    if (currentPage < totalPages) viewer.scrollActions.scrollToPage(currentPage + 1);
  };

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
