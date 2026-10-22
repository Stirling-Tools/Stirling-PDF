import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { CropParametersHook } from "@app/hooks/tools/crop/useCropParameters";
import {
  useViewScopedFiles,
  useViewScopedFileStubs,
} from "@app/hooks/tools/shared/useViewScopedFiles";
import CropCanvas, {
  type CropUnit,
} from "@app/components/tools/crop/CropCanvas";
import CropPageSelection from "@app/components/tools/crop/CropPageSelection";
import CropEditorOverlay from "@app/components/tools/crop/CropEditorOverlay";
import { useCropPagePreview } from "@app/components/tools/crop/useCropPagePreview";
import { useCropHistory } from "@app/components/tools/crop/useCropHistory";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";
import {
  MM_PER_POINT,
  clampPageRect,
  getDisplaySize,
  getPageBox,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import type { CropRatioId } from "@app/components/tools/crop/CropRatioPicker";
import { Rectangle } from "@app/utils/cropCoordinates";
import { useIsTouch } from "@app/hooks/useIsMobile";
import classes from "@app/components/tools/crop/CropSettings.module.css";

interface CropSettingsProps {
  parameters: CropParametersHook;
  disabled?: boolean;
}

type PageScope = "all" | "this" | "range";

/**
 * Inline crop surface: a large preview, the crop size, and one way into the
 * precision editor. Ratio, margins, coordinates and history live there, so the
 * panel never competes with the canvas.
 */
const CropSettings = ({ parameters, disabled = false }: CropSettingsProps) => {
  const { t } = useTranslation();
  const isTouch = useIsTouch();

  const [selectedStub = null] = useViewScopedFileStubs();
  const [selectedFile = null] = useViewScopedFiles();
  const [pageNumber, setPageNumber] = useState(1);
  const preview = useCropPagePreview(selectedFile ?? null, pageNumber);
  const geometry = preview.geometry;

  const [unit] = useState<CropUnit>("mm");
  const [ratioId, setRatioId] = useState<CropRatioId>("free");
  const [editorOpen, setEditorOpen] = useState(false);

  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;
  const geometryRef = useRef<CropPageGeometry | null>(null);
  geometryRef.current = geometry;

  const fileKey = selectedFile
    ? `${selectedFile.fileId}:${selectedFile.quickKey}`
    : null;

  useEffect(() => {
    setPageNumber(1);
  }, [fileKey]);

  const cropArea = parameters.getCropArea();
  const displaySize = useMemo(
    () => (geometry ? getDisplaySize(geometry) : { width: 1, height: 1 }),
    [geometry],
  );

  const applyArea = useCallback((area: Rectangle) => {
    const currentGeometry = geometryRef.current;
    if (!currentGeometry) return;
    parametersRef.current.setCropArea(
      clampPageRect(area, currentGeometry),
      getPageBox(currentGeometry),
    );
  }, []);

  const history = useCropHistory(cropArea, applyArea);
  const clearHistoryRef = useRef(history.clear);
  clearHistoryRef.current = history.clear;

  // A new document keeps the previous crop only when the user has actually
  // moved it; an untouched A4 placeholder should not leave a full-page Letter
  // document cropped to A4.
  const initialisedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!geometry) return;
    const key = `${fileKey}|${geometry.viewBox.join(",")}|${geometry.rotation}`;
    if (initialisedFor.current === key) return;
    initialisedFor.current = key;

    const current = parametersRef.current.getCropArea();
    const untouched =
      Math.abs(current.x - DEFAULT_CROP_AREA.x) < 0.2 &&
      Math.abs(current.y - DEFAULT_CROP_AREA.y) < 0.2 &&
      Math.abs(current.width - DEFAULT_CROP_AREA.width) < 0.2 &&
      Math.abs(current.height - DEFAULT_CROP_AREA.height) < 0.2;

    if (untouched) {
      parametersRef.current.resetToFullPDF(getPageBox(geometry));
    } else {
      parametersRef.current.setCropArea(
        clampPageRect(current, geometry),
        getPageBox(geometry),
      );
    }
    clearHistoryRef.current();
  }, [fileKey, geometry]);

  const handleReset = useCallback(() => {
    const currentGeometry = geometryRef.current;
    if (!currentGeometry) return;
    parametersRef.current.resetToFullPDF(getPageBox(currentGeometry));
  }, []);

  const display = geometry
    ? pageRectToDisplay(cropArea, geometry)
    : { x: 0, y: 0, width: 0, height: 0 };
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

  if (!selectedStub) {
    return (
      <Center style={{ height: 160 }}>
        <Text c="dimmed" size="sm">
          {t("crop.noFileSelected", "Add a PDF file to begin cropping")}
        </Text>
      </Center>
    );
  }

  const mode = parameters.parameters.autoCrop ? "auto" : "manual";
  const pageNumbers = (parameters.parameters.pageNumbers ?? "all").trim();
  const pageScope: PageScope =
    pageNumbers === "all" || pageNumbers === ""
      ? "all"
      : pageNumbers === String(pageNumber)
        ? "this"
        : "range";

  const changePage = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), Math.max(preview.pageCount, 1));
    setPageNumber(clamped);
    if (pageScope === "this") {
      parameters.updateParameter("pageNumbers", String(clamped));
    }
  };

  const changeScope = (scope: PageScope) => {
    if (scope === "all") {
      parameters.updateParameter("pageNumbers", "all");
      return;
    }
    if (scope === "this") {
      parameters.updateParameter("pageNumbers", String(pageNumber));
      return;
    }
    parameters.updateParameter(
      "pageNumbers",
      pageScope === "range"
        ? pageNumbers
        : preview.pageCount > 1
          ? `1-${preview.pageCount}`
          : "1",
    );
  };

  const sizeLabel = `${widthMm.toFixed(widthMm >= 10 ? 0 : 1)} × ${heightMm.toFixed(
    heightMm >= 10 ? 0 : 1,
  )} mm`;

  return (
    <Stack gap="sm" data-tour="crop-settings">
      <SegmentedControl
        fullWidth
        size="sm"
        value={mode}
        onChange={(value) =>
          parameters.updateParameter("autoCrop", value === "auto")
        }
        ariaLabel={t("crop.mode.label", "Crop mode")}
        disabled={disabled}
        options={[
          { value: "manual", label: t("crop.mode.manual", "Manual") },
          { value: "auto", label: t("crop.mode.auto", "Auto-trim") },
        ]}
      />

      {mode === "auto" ? (
        <Alert color="blue" variant="light" p="xs">
          <Text size="xs">
            {t(
              "crop.autoDescription",
              "White edges are detected and trimmed on every selected page. Your manual crop area is ignored.",
            )}
          </Text>
        </Alert>
      ) : !geometry ? (
        <Center style={{ height: 220 }}>
          {preview.error ? (
            <Text c="dimmed" size="sm">
              {t(
                "crop.previewUnavailable",
                "Preview unavailable. You can still set the area manually.",
              )}
            </Text>
          ) : (
            <Group gap="xs">
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                {t("crop.loadingPreview", "Preparing page preview…")}
              </Text>
            </Group>
          )}
        </Center>
      ) : (
        <>
          {preview.pageCount > 1 && (
            <Group justify="center" gap={2} wrap="nowrap">
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                onClick={() => changePage(pageNumber - 1)}
                disabled={disabled || pageNumber <= 1}
                aria-label={t("crop.previousPage", "Previous page")}
              >
                <Icon name="chevron-left" size="0.75rem" />
              </ActionIcon>
              <Text size="xs" c="dimmed" className={classes.pageLabel}>
                {pageNumber} / {preview.pageCount}
              </Text>
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                onClick={() => changePage(pageNumber + 1)}
                disabled={disabled || pageNumber >= preview.pageCount}
                aria-label={t("crop.nextPage", "Next page")}
              >
                <Icon name="chevron-right" size="0.75rem" />
              </ActionIcon>
            </Group>
          )}

          <Box
            className={classes.canvasFrame}
            style={{
              aspectRatio: `${displaySize.width} / ${displaySize.height}`,
            }}
          >
            <CropCanvas
              imageUrl={preview.imageUrl}
              geometry={geometry}
              cropArea={cropArea}
              onCropAreaChange={applyArea}
              aspectRatio={null}
              disabled={disabled}
              readOnly={isTouch}
              onRequestExpand={() => setEditorOpen(true)}
              unit={unit}
              ariaLabel={
                isTouch
                  ? t(
                      "crop.canvas.previewLabel",
                      "Crop area preview. Activate Edit crop area to adjust it.",
                    )
                  : t(
                      "crop.canvas.ariaLabel",
                      "Crop area editor. Drag a handle to resize, drag inside to move, arrow keys nudge, Shift plus arrow keys resize.",
                    )
              }
            />
          </Box>

          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text
                size="sm"
                fw={600}
                className={classes.sizeLabel}
                data-testid="crop-size-summary"
              >
                {sizeLabel}
              </Text>
              <Text size="xs" c="dimmed">
                {percent}%
              </Text>
            </Group>
            <Button
              variant="secondary"
              size="sm"
              leftSection={<Icon name="fullscreen" size={14} />}
              onClick={() => setEditorOpen(true)}
              disabled={disabled}
            >
              {t("crop.edit", "Edit")}
            </Button>
          </Group>
        </>
      )}

      <SegmentedControl
        fullWidth
        size="xs"
        value={pageScope}
        onChange={(value) => changeScope(value)}
        ariaLabel={t("crop.scope.title", "Apply to")}
        disabled={disabled}
        options={[
          { value: "all", label: t("crop.scope.all", "All pages") },
          { value: "this", label: t("crop.scope.this", "This page") },
          { value: "range", label: t("crop.scope.range", "Range") },
        ]}
      />
      {pageScope === "range" && (
        <CropPageSelection
          value={parameters.parameters.pageNumbers}
          onChange={(value) => parameters.updateParameter("pageNumbers", value)}
          disabled={disabled}
        />
      )}

      {geometry && (
        <CropEditorOverlay
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          imageUrl={preview.imageUrl}
          geometry={geometry}
          cropArea={cropArea}
          onCropAreaChange={applyArea}
          ratioId={ratioId}
          onRatioChange={(id) => setRatioId(id)}
          onReset={handleReset}
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          pageNumber={pageNumber}
          pageCount={preview.pageCount}
          onPageChange={changePage}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default CropSettings;
