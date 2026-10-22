import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Divider, FocusTrap, Group, Text } from "@mantine/core";
import { Collapsible } from "@app/ui/Collapsible";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import type { Rectangle } from "@app/utils/cropCoordinates";
import {
  MM_PER_POINT,
  getDisplaySize,
  getPageBox,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import CropCanvas, {
  type CropCanvasHandle,
  type CropUnit,
} from "@app/components/tools/crop/CropCanvas";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";
import CropMarginInputs from "@app/components/tools/crop/CropMarginInputs";
import CropRatioPicker, {
  ratioForPage,
  type CropRatioId,
} from "@app/components/tools/crop/CropRatioPicker";
import classes from "@app/components/tools/crop/CropEditorOverlay.module.css";

interface CropEditorOverlayProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string | null;
  geometry: CropPageGeometry;
  cropArea: Rectangle;
  onCropAreaChange: (area: Rectangle) => void;
  ratioId: CropRatioId;
  onRatioChange: (id: CropRatioId) => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pageNumber: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/**
 * Immersive crop editing. Changes apply live, so the only exit is "Done"; a
 * draft/commit pair here would hide the result the user is judging.
 */
export default function CropEditorOverlay({
  open,
  onClose,
  imageUrl,
  geometry,
  cropArea,
  onCropAreaChange,
  ratioId,
  onRatioChange,
  onReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  pageNumber,
  pageCount,
  onPageChange,
  disabled = false,
}: CropEditorOverlayProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const canvasRef = useRef<CropCanvasHandle>(null);
  const [zoom, setZoom] = useState(1);
  const [unit, setUnit] = useState<CropUnit>("mm");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const displaySize = useMemo(() => getDisplaySize(geometry), [geometry]);
  const display = useMemo(
    () => pageRectToDisplay(cropArea, geometry),
    [cropArea, geometry],
  );
  const widthMm = display.width * MM_PER_POINT;
  const heightMm = display.height * MM_PER_POINT;
  const percent =
    displaySize.width > 0 && displaySize.height > 0
      ? Math.round(
          (display.width / displaySize.width) *
            (display.height / displaySize.height) *
            100,
        )
      : 0;
  const aspectRatio = ratioForPage(ratioId, displaySize);

  if (!open) return null;

  return createPortal(
    <div className={classes.backdrop} role="presentation">
      <FocusTrap active>
        <div
          className={classes.editor}
          data-testid="crop-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className={classes.header}>
            <div className={classes.headerText}>
              <div id={titleId} className={classes.title}>
                {t("crop.editor.title", "Adjust crop area")}
              </div>
              <div className={classes.subtitle}>
                {t(
                  "crop.editor.subtitle",
                  "Drag a handle to trim. Pinch or scroll to zoom.",
                )}
              </div>
            </div>
            <Button
              className={classes.headerAction}
              variant="primary"
              size="sm"
              leftSection={<Icon name="check" size={16} />}
              onClick={onClose}
            >
              {t("crop.editor.done", "Done")}
            </Button>
          </header>

          <div className={classes.toolbarRow}>
            <Group gap={2} wrap="nowrap">
              {pageCount > 1 && (
                <>
                  <ActionIcon
                    variant="quiet"
                    accent="neutral"
                    size="sm"
                    onClick={() => onPageChange(pageNumber - 1)}
                    disabled={disabled || pageNumber <= 1}
                    aria-label={t("crop.previousPage", "Previous page")}
                  >
                    <Icon name="chevron-left" size="0.875rem" />
                  </ActionIcon>
                  <Text size="xs" c="dimmed" className={classes.pageNumber}>
                    {pageNumber} / {pageCount}
                  </Text>
                  <ActionIcon
                    variant="quiet"
                    accent="neutral"
                    size="sm"
                    onClick={() => onPageChange(pageNumber + 1)}
                    disabled={disabled || pageNumber >= pageCount}
                    aria-label={t("crop.nextPage", "Next page")}
                  >
                    <Icon name="chevron-right" size="0.875rem" />
                  </ActionIcon>
                </>
              )}
            </Group>
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant={gridEnabled ? "secondary" : "quiet"}
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.toggleGrid", "Toggle grid")}
                aria-pressed={gridEnabled}
                title={t("crop.canvas.toggleGrid", "Toggle grid")}
                onClick={() => setGridEnabled((previous) => !previous)}
              >
                <Icon name="layout-grid" size="0.875rem" />
              </ActionIcon>
              <ActionIcon
                variant={snapEnabled ? "secondary" : "quiet"}
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.toggleSnap", "Toggle snapping")}
                aria-pressed={snapEnabled}
                title={t("crop.canvas.toggleSnap", "Toggle snapping")}
                onClick={() => setSnapEnabled((previous) => !previous)}
              >
                <Icon name="magnet" size="0.875rem" />
              </ActionIcon>
              <div className={classes.toolbarDivider} aria-hidden="true" />
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.zoomOut", "Zoom out")}
                onClick={() => canvasRef.current?.zoomOut()}
              >
                <Icon name="zoom-out" size="0.875rem" />
              </ActionIcon>
              <button
                type="button"
                className={classes.zoomLabel}
                onClick={() => canvasRef.current?.fit()}
                aria-label={t("crop.canvas.fitToPage", "Fit to page")}
                title={t("crop.canvas.fitToPage", "Fit to page")}
              >
                {Math.round(zoom * 100)}%
              </button>
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.zoomIn", "Zoom in")}
                onClick={() => canvasRef.current?.zoomIn()}
              >
                <Icon name="zoom-in" size="0.875rem" />
              </ActionIcon>
            </Group>
          </div>

          <div className={classes.body}>
            <div className={classes.canvasArea}>
              <CropCanvas
                ref={canvasRef}
                expanded
                showToolbar={false}
                onZoomChange={setZoom}
                imageUrl={imageUrl}
                geometry={geometry}
                cropArea={cropArea}
                onCropAreaChange={onCropAreaChange}
                aspectRatio={aspectRatio}
                disabled={disabled}
                gridEnabled={gridEnabled}
                snapEnabled={snapEnabled}
                unit={unit}
                ariaLabel={t(
                  "crop.canvas.ariaLabel",
                  "Crop area editor. Drag a handle to resize, drag inside to move, arrow keys nudge, Shift plus arrow keys resize.",
                )}
              />
            </div>

            <aside className={classes.panel}>
              <div className={classes.summary}>
                <Text
                  size="lg"
                  fw={600}
                  className={classes.summarySize}
                  data-testid="crop-editor-size"
                >
                  {widthMm.toFixed(widthMm >= 10 ? 0 : 1)} ×{" "}
                  {heightMm.toFixed(heightMm >= 10 ? 0 : 1)} mm
                </Text>
                <Text size="xs" c="dimmed">
                  {t("crop.result.ofPage", "{{percent}}% of page", {
                    percent,
                  })}
                </Text>
              </div>

              <Divider />

              <CropRatioPicker
                value={ratioId}
                onChange={onRatioChange}
                disabled={disabled}
              />
              <CropMarginInputs
                cropArea={cropArea}
                geometry={geometry}
                onChange={onCropAreaChange}
                unit={unit}
                onUnitChange={setUnit}
                disabled={disabled}
              />

              <Collapsible
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((previous) => !previous)}
                header={
                  <Text size="xs" fw={600} c="dimmed">
                    {t("crop.advanced.title", "Exact coordinates")}
                  </Text>
                }
              >
                <CropCoordinateInputs
                  cropArea={cropArea}
                  onCoordinateChange={(field, value) => {
                    const numeric =
                      typeof value === "string"
                        ? Number.parseFloat(value)
                        : value;
                    if (!Number.isFinite(numeric)) return;
                    onCropAreaChange({ ...cropArea, [field]: numeric });
                  }}
                  disabled={disabled}
                  pageBox={getPageBox(geometry)}
                  showAutomationInfo={false}
                />
              </Collapsible>

              <Group grow gap="xs">
                <Button
                  variant="secondary"
                  size="sm"
                  leftSection={<Icon name="undo-2" size={14} />}
                  onClick={onUndo}
                  disabled={disabled || !canUndo}
                >
                  {t("crop.undo", "Undo")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftSection={<Icon name="redo-2" size={14} />}
                  onClick={onRedo}
                  disabled={disabled || !canRedo}
                >
                  {t("crop.redo", "Redo")}
                </Button>
              </Group>
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                leftSection={<Icon name="rotate-ccw" size={14} />}
                onClick={onReset}
              >
                {t("crop.reset", "Reset to full page")}
              </Button>
            </aside>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body,
  );
}
