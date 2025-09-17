import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "../contexts/FileContext";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useAddStampParameters } from "../components/tools/addStamp/useAddStampParameters";
import { useAddStampOperation } from "../components/tools/addStamp/useAddStampOperation";
import { Group, Select, Stack, Textarea, TextInput, ColorInput, Button, Slider, Text, NumberInput } from "@mantine/core";
import StampPreview from "../components/tools/addStamp/StampPreview";
import LocalIcon from "../components/shared/LocalIcon";
import styles from "../components/tools/addStamp/StampPreview.module.css";
import { Tooltip } from "../components/shared/Tooltip";
import ButtonSelector from "../components/shared/ButtonSelector";

const AddStamp = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const [collapsedType, setCollapsedType] = useState(false);
  const [collapsedFormatting, setCollapsedFormatting] = useState(true);
  const [collapsedPageSelection, setCollapsedPageSelection] = useState(false);
  const [textConfirmed, setTextConfirmed] = useState(false);
  const [quickPositionModeSelected, setQuickPositionModeSelected] = useState(false);
  const [customPositionModeSelected, setCustomPositionModeSelected] = useState(true);

  const params = useAddStampParameters();
  const operation = useAddStampOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-stamp");

  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  // Auto-collapse steps 2 and 3, and auto-expand step 4 when an image is uploaded
  useEffect(() => {
    if (params.parameters.stampType === 'image' && params.parameters.stampImage) {
      setCollapsedType(true);
      setCollapsedPageSelection(true);
      setCollapsedFormatting(false); // Auto-expand step 4 (Position & Formatting)
    }
  }, [params.parameters.stampType, params.parameters.stampImage]);

  // Reset text confirmation when inputs change
  useEffect(() => {
    if (params.parameters.stampType !== 'text') {
      setTextConfirmed(false);
    } else {
      setTextConfirmed(false);
    }
  }, [params.parameters.stampType, params.parameters.stampText, params.parameters.alphabet]);

  // Do not auto-collapse when switching types to avoid hiding file input prematurely

  const handleExecute = async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error: any) {
      onError?.(error?.message || t("AddStampRequest.error.failed", "Add stamp operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: File settings (page selection) - auto-collapse when image is uploaded
    steps.push({
      title: t("AddStampRequest.pageSelection", "Page Selection"),
      isCollapsed: hasResults || collapsedPageSelection,
      onCollapsedClick: hasResults ? () => operation.resetResults() : () => setCollapsedPageSelection(!collapsedPageSelection),
      isVisible: hasFiles || hasResults,
      content: (
        <Stack gap="md">
          <TextInput
            label={t('pageSelectionPrompt', 'Page Selection (e.g. 1,3,2 or 4-8,2,10-12 or 2n-1)')}
            value={params.parameters.pageNumbers}
            onChange={(e) => params.updateParameter('pageNumbers', e.currentTarget.value)}
            disabled={endpointLoading}
          />
        </Stack>
      ),
    });

    // Step 2: Type & Content - auto-collapse when image is uploaded
    steps.push({
      title: t("AddStampRequest.stampType", "Stamp Type"),
      isCollapsed: hasResults ? true : collapsedType,
      onCollapsedClick: hasResults ? () => operation.resetResults() : () => setCollapsedType(!collapsedType),
      isVisible: hasFiles || hasResults,
      content: (
        <Stack gap="md" justify="space-between" flex={1}>
          <div>
            <Text size="sm" fw={500} mb="xs">{t('AddStampRequest.stampType', 'Stamp Type')}</Text>
            <ButtonSelector
              value={params.parameters.stampType}
              onChange={(v: 'text' | 'image') => params.updateParameter('stampType', v)}
              options={[
                { value: 'text', label: t('watermark.type.1', 'Text') },
                { value: 'image', label: t('watermark.type.2', 'Image') },
              ]}
              disabled={endpointLoading}
              buttonClassName={styles.modeToggleButton}
              textClassName={styles.modeToggleButtonText}
            />
          </div>

          {params.parameters.stampType === 'text' && (
            <>
              <Textarea
                label={t('AddStampRequest.stampText', 'Stamp Text')}
                value={params.parameters.stampText}
                onChange={(e) => params.updateParameter('stampText', e.currentTarget.value)}
                autosize
                minRows={2}
                disabled={endpointLoading}
              />
              <Group justify="flex-start">
                <Button
                  size="xs"
                  onClick={() => {
                    if ((params.parameters.stampText || '').trim().length === 0) return;
                    setTextConfirmed(true);
                    setCollapsedType(true);
                    setCollapsedPageSelection(true);
                    setCollapsedFormatting(false);
                  }}
                  disabled={(params.parameters.stampText || '').trim().length === 0}
                >
                  {textConfirmed ? t('confirmed', 'Confirmed') : t('confirm', 'Confirm')}
                </Button>
              </Group>
              <Select
                label={t('AddStampRequest.alphabet', 'Alphabet')}
                value={params.parameters.alphabet}
                onChange={(v) => params.updateParameter('alphabet', (v as any) || 'roman')}
                data={[
                  { value: 'roman', label: 'Roman' },
                  { value: 'arabic', label: 'العربية' },
                  { value: 'japanese', label: '日本語' },
                  { value: 'korean', label: '한국어' },
                  { value: 'chinese', label: '简体中文' },
                  { value: 'thai', label: 'ไทย' },
                ]}
                disabled={endpointLoading}
              />
            </>
          )}

          {params.parameters.stampType === 'image' && (
            <Stack gap="xs">
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) params.updateParameter('stampImage', file);
                }}
                disabled={endpointLoading}
                style={{ display: 'none' }}
                id="stamp-image-input"
              />
              <Button
                size="xs"
                component="label"
                htmlFor="stamp-image-input"
                disabled={endpointLoading}
              >
                {t('chooseFile', 'Choose File')}
              </Button>
              {params.parameters.stampImage && (
                <Text size="xs" c="dimmed">
                  {params.parameters.stampImage.name}
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      ),
    });

    // Step 3: Formatting & Position
    steps.push({
      title: t("AddStampRequest.positionAndFormatting", "Position & Formatting"),
      isCollapsed: hasResults ? true : collapsedFormatting,
      onCollapsedClick: hasResults ? () => operation.resetResults() : () => {
        // Prevent collapsing until text confirmed
        if (params.parameters.stampType === 'text' && !textConfirmed) return;
        setCollapsedFormatting(!collapsedFormatting);
        if (collapsedFormatting) setCollapsedType(true);
      },
      isVisible: hasFiles || hasResults,
      content: (
        <Stack gap="md" justify="space-between">
          {/* Mode toggle: Quick grid vs Custom drag - only show for image stamps */}
          {params.parameters.stampType === 'image' && (
            <ButtonSelector
              value={quickPositionModeSelected ? 'quick' : 'custom'}
              onChange={(v: 'quick' | 'custom') => {
                const isQuick = v === 'quick';
                setQuickPositionModeSelected(isQuick);
                setCustomPositionModeSelected(!isQuick);
              }}
              options={[
                { value: 'quick', label: t('quickPosition', 'Quick Position') },
                { value: 'custom', label: t('customPosition', 'Custom Position') },
              ]}
              disabled={endpointLoading}
              buttonClassName={styles.modeToggleButton}
              textClassName={styles.modeToggleButtonText}
            />
          )}

          {params.parameters.stampType === 'image' && customPositionModeSelected && (
            <div className={styles.informationContainer}>
              <Text className={styles.informationText}>{t('AddStampRequest.customPosition', 'Drag the stamp to the desired location in the preview window.')}</Text>
            </div>
          )}
          {params.parameters.stampType === 'image' && !customPositionModeSelected && (
            <div className={styles.informationContainer}>
              <Text className={styles.informationText}>{t('AddStampRequest.quickPosition', 'Select a position on the page to place the stamp.')}</Text>
            </div>
          )}


          {/* Icon pill buttons row */}
          <div className="flex justify-between gap-[0.5rem]">
            <Tooltip content={t('AddStampRequest.rotation', 'Rotation')} position="top">
              <Button
                variant={(params.parameters as any)._activePill === 'rotation' ? 'filled' : 'outline'}
                className="flex-1"
                onClick={() => params.updateParameter('_activePill' as any, 'rotation' as any)}
              >
                <LocalIcon icon="rotate-right-rounded" width="1.1rem" height="1.1rem" />
              </Button>
            </Tooltip>
            <Tooltip content={t('AddStampRequest.opacity', 'Opacity')} position="top">
              <Button
                variant={(params.parameters as any)._activePill === 'opacity' ? 'filled' : 'outline'}
                className="flex-1"
                onClick={() => params.updateParameter('_activePill' as any, 'opacity' as any)}
              >
                <LocalIcon icon="opacity" width="1.1rem" height="1.1rem" />
              </Button>
            </Tooltip>
            <Tooltip content={params.parameters.stampType === 'image' ? t('AddStampRequest.imageSize', 'Image Size') : t('AddStampRequest.fontSize', 'Font Size')} position="top">
              <Button
                variant={(params.parameters as any)._activePill === 'fontSize' ? 'filled' : 'outline'}
                className="flex-1"
                onClick={() => params.updateParameter('_activePill' as any, 'fontSize' as any)}
              >
                <LocalIcon icon="zoom-in-map-rounded" width="1.1rem" height="1.1rem" />
              </Button>
            </Tooltip>
          </div>

          {/* Single slider bound to selected pill */}
          {(params.parameters as any)._activePill === 'fontSize' && (
            <Stack gap="xs">
              <Text className={styles.labelText}>
                {params.parameters.stampType === 'image' 
                  ? t('AddStampRequest.imageSize', 'Image Size')
                  : t('AddStampRequest.fontSize', 'Font Size')
                }
              </Text>
              <Group className={styles.sliderGroup} align="center">
                <NumberInput
                  value={params.parameters.fontSize}
                  onChange={(v) => params.updateParameter('fontSize', typeof v === 'number' ? v : 1)}
                  min={1}
                  max={400}
                  step={1}
                  size="sm"
                  className={styles.numberInput}
                  disabled={endpointLoading}
                />
                <Slider
                  value={params.parameters.fontSize}
                  onChange={(v) => params.updateParameter('fontSize', v as number)}
                  min={1}
                  max={400}
                  step={1}
                  className={styles.slider}
                />
              </Group>
            </Stack>
          )}
          {(params.parameters as any)._activePill === 'rotation' && (
            <Stack gap="xs">
              <Text className={styles.labelText}>{t('AddStampRequest.rotation', 'Rotation')}</Text>
              <Group className={styles.sliderGroup} align="center">
                <NumberInput
                  value={params.parameters.rotation}
                  onChange={(v) => params.updateParameter('rotation', typeof v === 'number' ? v : 0)}
                  min={-180}
                  max={180}
                  step={1}
                  size="sm"
                  className={styles.numberInput}
                  hideControls
                  disabled={endpointLoading}
                />
                <Slider
                  value={params.parameters.rotation}
                  onChange={(v) => params.updateParameter('rotation', v as number)}
                  min={-180}
                  max={180}
                  step={1}
                  className={styles.sliderWide}
                />
              </Group>
            </Stack>
          )}
          {(params.parameters as any)._activePill === 'opacity' && (
            <Stack gap="xs">
              <Text className={styles.labelText}>{t('AddStampRequest.opacity', 'Opacity')}</Text>
              <Group className={styles.sliderGroup} align="center">
                <NumberInput
                  value={params.parameters.opacity}
                  onChange={(v) => params.updateParameter('opacity', typeof v === 'number' ? v : 0)}
                  min={0}
                  max={100}
                  step={1}
                  size="sm"
                  className={styles.numberInput}
                  disabled={endpointLoading}
                />
                <Slider
                  value={params.parameters.opacity}
                  onChange={(v) => params.updateParameter('opacity', v as number)}
                  min={0}
                  max={100}
                  step={1}
                  className={styles.slider}
                />
              </Group>
            </Stack>
          )}


          {params.parameters.stampType !== 'image' && (
            <ColorInput
              label={t('AddStampRequest.customColor', 'Custom Text Color')}
              value={params.parameters.customColor}
              onChange={(value) => params.updateParameter('customColor', value)}
              format="hex"
              disabled={endpointLoading}
            />
          )}


          {/* Unified preview; when in quick mode, overlay grid inside preview */}
          <StampPreview
            parameters={params.parameters}
            onParameterChange={params.updateParameter}
            file={selectedFiles[0] || null}
            showQuickGrid={params.parameters.stampType === 'text' ? true : quickPositionModeSelected}
          />
        </Stack>
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('AddStampRequest.submit', 'Add Stamp'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('AddStampRequest.results.title', 'Stamp Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
    forceStepNumbers: true,
  });
};

AddStamp.tool = () => useAddStampOperation;

export default AddStamp as ToolComponent;


