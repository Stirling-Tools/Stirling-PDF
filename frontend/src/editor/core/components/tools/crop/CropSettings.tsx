import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Center,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { Collapsible } from "@editor/ui/Collapsible";
import { Icon } from "@editor/ui/Icon";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { CropParametersHook } from "@editor/hooks/tools/crop/useCropParameters";
import {
  useViewScopedFiles,
  useViewScopedFileStubs,
} from "@editor/hooks/tools/shared/useViewScopedFiles";
import CropCanvas, {
  type CropUnit,
} from "@editor/components/tools/crop/CropCanvas";
import CropPageSelection from "@editor/components/tools/crop/CropPageSelection";
import CropEditorOverlay from "@editor/components/tools/crop/CropEditorOverlay";
import CropViewerSessionPublisher from "@editor/components/tools/crop/CropViewerSessionPublisher";
import CropResultView from "@editor/components/tools/crop/CropResultView";
import { useCropPagePreview } from "@editor/components/tools/crop/useCropPagePreview";
import { useCropPageBlend } from "@editor/components/tools/crop/useCropPageBlend";
import { useCropHistory } from "@editor/components/tools/crop/useCropHistory";
import { DEFAULT_CROP_AREA } from "@editor/constants/cropConstants";
import {
  MM_PER_POINT,
  clampPageRect,
  getDisplaySize,
  getPageBox,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@editor/utils/cropPageGeometry";
import type { CropRatioId } from "@editor/components/tools/crop/CropRatioPicker";
import CropRatioPicker, {
  ratioForPage,
} from "@editor/components/tools/crop/CropRatioPicker";
import CropMarginInputs from "@editor/components/tools/crop/CropMarginInputs";
import CropCoordinateInputs from "@editor/components/tools/crop/CropCoordinateInputs";
import { useCropSurfaceMode } from "@editor/components/tools/crop/cropViewerSession";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { requestMobileView } from "@editor/services/mobileViewBridge";
import { Rectangle } from "@editor/utils/cropCoordinates";
import { useIsTouch } from "@editor/hooks/useIsMobile";
import classes from "@editor/components/tools/crop/CropSettings.module.css";

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
  const isMobile = useIsMobile();

  const [selectedStub = null] = useViewScopedFileStubs();
  const [selectedFile = null] = useViewScopedFiles();
  const [pageNumber, setPageNumber] = useState(1);
  const preview = useCropPagePreview(selectedFile ?? null, pageNumber);
  const geometry = preview.geometry;

  const [unit, setUnit] = useState<CropUnit>("mm");
  const [ratioId, setRatioId] = useState<CropRatioId>("free");
  const [editorOpen, setEditorOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [blendEnabled, setBlendEnabled] = useState(true);
  const surfaceMode = useCropSurfaceMode();

  const blend = useCropPageBlend(
    selectedFile ?? null,
    geometry,
    blendEnabled && preview.pageCount > 1,
    pageNumber,
  );

  const lastGeometryRef = useRef<CropPageGeometry | null>(null);
  const geometryPageRef = useRef(1);
  if (geometry) {
    lastGeometryRef.current = geometry;
    geometryPageRef.current = preview.pageNumber;
  }
  const sessionGeometry = geometry ?? lastGeometryRef.current;

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

  const applyAreaTo = useCallback(
    (area: Rectangle, targetGeometry: CropPageGeometry) => {
      parametersRef.current.setCropArea(
        clampPageRect(area, targetGeometry),
        getPageBox(targetGeometry),
      );
    },
    [],
  );

  const applyArea = useCallback(
    (area: Rectangle) => {
      const currentGeometry = geometryRef.current;
      if (!currentGeometry) return;
      applyAreaTo(area, currentGeometry);
    },
    [applyAreaTo],
  );

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
  const viewerSurface = surfaceMode === "viewer" && !disabled;
  const aspectRatio = ratioForPage(ratioId, displaySize);
  const sizeControls = (
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
      <Group gap={4} wrap="nowrap">
        {viewerSurface ? (
          <>
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              aria-label={t("crop.undo", "Undo")}
              title={t("crop.undo", "Undo")}
              onClick={history.undo}
              disabled={disabled || !history.canUndo}
            >
              <Icon name="undo-2" size="0.875rem" />
            </ActionIcon>
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              aria-label={t("crop.redo", "Redo")}
              title={t("crop.redo", "Redo")}
              onClick={history.redo}
              disabled={disabled || !history.canRedo}
            >
              <Icon name="redo-2" size="0.875rem" />
            </ActionIcon>
          </>
        ) : (
          <>
            <ActionIcon
              variant={showResult ? "secondary" : "quiet"}
              accent="neutral"
              size="sm"
              aria-label={t("crop.preview.toggle", "Preview result")}
              aria-pressed={showResult}
              title={t("crop.preview.toggle", "Preview result")}
              onClick={() => setShowResult((previous) => !previous)}
              disabled={disabled}
            >
              <Icon name="eye" size="0.875rem" />
            </ActionIcon>
            <Button
              variant="secondary"
              size="sm"
              leftSection={<Icon name="fullscreen" size={14} />}
              onClick={() => setEditorOpen(true)}
              disabled={disabled}
            >
              {t("crop.edit", "Edit")}
            </Button>
          </>
        )}
      </Group>
    </Group>
  );
  const scopeControls = (
    <>
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
    </>
  );

  return (
    <Stack
      gap="sm"
      data-tour="crop-settings"
      style={viewerSurface ? { paddingBottom: 56 } : undefined}
    >
      {sessionGeometry && (
        <CropViewerSessionPublisher
          enabled={viewerSurface && mode === "manual"}
          geometry={sessionGeometry}
          geometryPageNumber={geometryPageRef.current}
          cropArea={cropArea}
          pageNumber={pageNumber}
          aspectRatio={aspectRatio}
          onApplyArea={applyAreaTo}
          onPageChange={changePage}
        />
      )}
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
          {!viewerSurface && preview.pageCount > 1 && (
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
              <ActionIcon
                variant={blendEnabled ? "secondary" : "quiet"}
                accent="neutral"
                size="sm"
                onClick={() => setBlendEnabled((previous) => !previous)}
                aria-label={t("crop.blend.toggle", "Blend all pages")}
                aria-pressed={blendEnabled}
                title={t("crop.blend.toggle", "Blend all pages")}
                data-testid="crop-blend-toggle"
              >
                <Icon name="layers" size="0.75rem" />
              </ActionIcon>
            </Group>
          )}

          {isMobile && !viewerSurface && sizeControls}

          {viewerSurface ? (
            isMobile && (
              <Button
                variant="primary"
                size="sm"
                leftSection={<Icon name="move" size={14} />}
                onClick={() => requestMobileView("workbench")}
                disabled={disabled}
              >
                {t("crop.viewer.openPage", "Crop on page")}
              </Button>
            )
          ) : (
            <Box
              className={classes.canvasFrame}
              style={{
                aspectRatio: showResult
                  ? `${display.width} / ${display.height}`
                  : `${displaySize.width} / ${displaySize.height}`,
              }}
            >
              {showResult ? (
                <CropResultView
                  imageUrl={preview.imageUrl}
                  geometry={geometry}
                  cropArea={cropArea}
                />
              ) : (
                <CropCanvas
                  imageUrl={preview.imageUrl}
                  blendUrl={blend.blendUrl}
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
              )}
            </Box>
          )}

          {(!isMobile || viewerSurface) && sizeControls}

          {viewerSurface && (
            <>
              {scopeControls}
              <Divider />
              <CropRatioPicker
                compact
                value={ratioId}
                onChange={setRatioId}
                disabled={disabled}
              />
              <Button
                variant="secondary"
                size="sm"
                leftSection={<Icon name="fullscreen" size={14} />}
                onClick={() => setEditorOpen(true)}
                disabled={disabled}
              >
                {t("crop.editor.open", "Precision editor")}
              </Button>
              <Collapsible
                open={marginsOpen}
                onToggle={() => setMarginsOpen((previous) => !previous)}
                header={
                  <Text size="xs" fw={600} c="dimmed">
                    {t("crop.margins.title", "Margins")}
                  </Text>
                }
              >
                <CropMarginInputs
                  cropArea={cropArea}
                  imageUrl={preview.imageUrl}
                  geometry={geometry}
                  onChange={applyArea}
                  unit={unit}
                  onUnitChange={setUnit}
                  disabled={disabled}
                />
              </Collapsible>
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
                    applyArea({ ...cropArea, [field]: numeric });
                  }}
                  disabled={disabled}
                  pageBox={getPageBox(geometry)}
                  showAutomationInfo={false}
                />
              </Collapsible>
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                leftSection={<Icon name="rotate-ccw" size={14} />}
                onClick={handleReset}
              >
                {t("crop.reset", "Reset to full page")}
              </Button>
            </>
          )}
        </>
      )}

      {(!viewerSurface || mode === "auto") && scopeControls}

      {geometry && (
        <CropEditorOverlay
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          imageUrl={preview.imageUrl}
          blendUrl={blend.blendUrl}
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
          pageCount={viewerSurface ? 1 : preview.pageCount}
          onPageChange={viewerSurface ? () => undefined : changePage}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default CropSettings;
