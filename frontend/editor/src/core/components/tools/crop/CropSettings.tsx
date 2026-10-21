import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Collapsible } from "@app/ui/Collapsible";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { CropParametersHook } from "@app/hooks/tools/crop/useCropParameters";
import {
  useViewScopedFiles,
  useViewScopedFileStubs,
} from "@app/hooks/tools/shared/useViewScopedFiles";
import CropCanvas, {
  type CropUnit,
} from "@app/components/tools/crop/CropCanvas";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";
import CropPageSelection from "@app/components/tools/crop/CropPageSelection";
import CropMarginInputs from "@app/components/tools/crop/CropMarginInputs";
import CropRatioPicker, {
  ratioForPage,
  type CropRatioId,
} from "@app/components/tools/crop/CropRatioPicker";
import CropEditorOverlay from "@app/components/tools/crop/CropEditorOverlay";
import { useCropPagePreview } from "@app/components/tools/crop/useCropPagePreview";
import { fitRatio } from "@app/components/tools/crop/cropInteractionMath";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";
import {
  clampPageRect,
  displayRectToPage,
  getDisplaySize,
  getPageBox,
  isFullPageRect,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import { Rectangle } from "@app/utils/cropCoordinates";
import { useIsTouch } from "@app/hooks/useIsMobile";
import classes from "@app/components/tools/crop/CropSettings.module.css";

interface CropSettingsProps {
  parameters: CropParametersHook;
  disabled?: boolean;
}

const CropSettings = ({ parameters, disabled = false }: CropSettingsProps) => {
  const { t } = useTranslation();
  const isTouch = useIsTouch();

  const [selectedStub = null] = useViewScopedFileStubs();
  const [selectedFile = null] = useViewScopedFiles();
  const preview = useCropPagePreview(selectedFile ?? null);
  const geometry = preview.geometry;

  const [unit, setUnit] = useState<CropUnit>("mm");
  const [ratioId, setRatioId] = useState<CropRatioId>("free");
  const [editorOpen, setEditorOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;
  const geometryRef = useRef<CropPageGeometry | null>(null);
  geometryRef.current = geometry;

  const fileKey = selectedFile
    ? `${selectedFile.fileId}:${selectedFile.quickKey}`
    : null;

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
      return;
    }
    parametersRef.current.setCropArea(
      clampPageRect(current, geometry),
      getPageBox(geometry),
    );
  }, [fileKey, geometry]);

  const cropArea = parameters.getCropArea();
  const displaySize = useMemo(
    () => (geometry ? getDisplaySize(geometry) : { width: 1, height: 1 }),
    [geometry],
  );
  const aspectRatio = geometry ? ratioForPage(ratioId, displaySize) : null;
  const pageBox = geometry ? getPageBox(geometry) : null;
  const isFullCrop = geometry ? isFullPageRect(cropArea, geometry) : false;

  const applyArea = useCallback((area: Rectangle) => {
    const currentGeometry = geometryRef.current;
    if (!currentGeometry) return;
    parametersRef.current.setCropArea(
      clampPageRect(area, currentGeometry),
      getPageBox(currentGeometry),
    );
  }, []);

  const handleReset = useCallback(() => {
    const currentGeometry = geometryRef.current;
    if (!currentGeometry) return;
    parametersRef.current.resetToFullPDF(getPageBox(currentGeometry));
  }, []);

  const handleRatioChange = useCallback(
    (id: CropRatioId) => {
      setRatioId(id);
      const currentGeometry = geometryRef.current;
      if (!currentGeometry) return;
      const ratio = ratioForPage(id, getDisplaySize(currentGeometry));
      if (ratio === null) return;

      const display = pageRectToDisplay(
        parametersRef.current.getCropArea(),
        currentGeometry,
      );
      const size = getDisplaySize(currentGeometry);
      const fitted = fitRatio(ratio, {
        x: display.x / size.width,
        y: display.y / size.height,
        width: display.width / size.width,
        height: display.height / size.height,
      });
      applyArea(
        displayRectToPage(
          {
            x: fitted.x * size.width,
            y: fitted.y * size.height,
            width: fitted.width * size.width,
            height: fitted.height * size.height,
          },
          currentGeometry,
        ),
      );
    },
    [applyArea],
  );

  const handleCoordinateChange = useCallback(
    (field: keyof Rectangle, value: number | string) => {
      const numeric =
        typeof value === "string" ? Number.parseFloat(value) : value;
      if (!Number.isFinite(numeric)) return;
      applyArea({ ...parametersRef.current.getCropArea(), [field]: numeric });
    },
    [applyArea],
  );

  useEffect(() => {
    const handleSetCropArea = (event: Event) => {
      const customEvent = event as CustomEvent<Rectangle>;
      if (customEvent.detail) applyArea(customEvent.detail);
    };
    window.addEventListener("tour:setCropArea", handleSetCropArea);
    return () =>
      window.removeEventListener("tour:setCropArea", handleSetCropArea);
  }, [applyArea]);

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

  return (
    <Stack gap="md" data-tour="crop-settings">
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
          {
            value: "manual",
            label: t("crop.mode.manual", "Manual"),
          },
          {
            value: "auto",
            label: t("crop.mode.auto", "Auto-trim"),
          },
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
        <Center style={{ height: 180 }}>
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
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="sm" fw={600}>
              {t("crop.preview.title", "Crop area")}
            </Text>
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                onClick={handleReset}
                disabled={disabled || isFullCrop}
                title={t("crop.reset", "Reset to full page")}
                aria-label={t("crop.reset", "Reset to full page")}
              >
                <Icon name="rotate-ccw" size="0.875rem" />
              </ActionIcon>
              <Button
                variant="secondary"
                size="sm"
                leftSection={<Icon name="fullscreen" size={14} />}
                onClick={() => setEditorOpen(true)}
                disabled={disabled}
              >
                {t("crop.editor.open", "Expand")}
              </Button>
            </Group>
          </Group>

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
              aspectRatio={aspectRatio}
              disabled={disabled}
              readOnly={isTouch}
              onRequestExpand={isTouch ? () => setEditorOpen(true) : undefined}
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

          <CropRatioPicker
            value={ratioId}
            onChange={handleRatioChange}
            disabled={disabled}
          />

          <CropMarginInputs
            cropArea={cropArea}
            geometry={geometry}
            onChange={applyArea}
            unit={unit}
            onUnitChange={setUnit}
            disabled={disabled}
          />

          <div className={classes.advanced}>
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
                onCoordinateChange={handleCoordinateChange}
                disabled={disabled}
                pageBox={pageBox ?? undefined}
                showAutomationInfo={false}
              />
            </Collapsible>
          </div>
        </>
      )}

      <CropPageSelection
        value={parameters.parameters.pageNumbers}
        onChange={(value) => parameters.updateParameter("pageNumbers", value)}
        disabled={disabled}
      />

      {geometry && (
        <CropEditorOverlay
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          imageUrl={preview.imageUrl}
          geometry={geometry}
          cropArea={cropArea}
          onCropAreaChange={applyArea}
          aspectRatio={aspectRatio}
          ratioId={ratioId}
          onRatioChange={handleRatioChange}
          unit={unit}
          onUnitChange={setUnit}
          onReset={handleReset}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default CropSettings;
