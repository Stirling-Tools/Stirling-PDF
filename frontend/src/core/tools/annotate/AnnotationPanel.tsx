import { useMemo, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, Group, ActionIcon, Stack, Slider, Box, Tooltip as MantineTooltip, Button, Tooltip, Paper } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { ColorPicker, ColorSwatchButton } from '@app/components/annotation/shared/ColorPicker';
import { ImageUploader } from '@app/components/annotation/shared/ImageUploader';
import { SuggestedToolsSection } from '@app/components/tools/shared/SuggestedToolsSection';
import { DrawingControls } from '@app/components/annotation/shared/DrawingControls';
import type { AnnotationToolId, AnnotationAPI } from '@app/components/viewer/viewerTypes';

interface StyleState {
  inkColor: string;
  inkWidth: number;
  highlightColor: string;
  highlightOpacity: number;
  freehandHighlighterWidth: number;
  underlineColor: string;
  underlineOpacity: number;
  strikeoutColor: string;
  strikeoutOpacity: number;
  squigglyColor: string;
  squigglyOpacity: number;
  textColor: string;
  textSize: number;
  textAlignment: 'left' | 'center' | 'right';
  textBackgroundColor: string;
  noteBackgroundColor: string;
  shapeStrokeColor: string;
  shapeFillColor: string;
  shapeOpacity: number;
  shapeStrokeOpacity: number;
  shapeFillOpacity: number;
  shapeThickness: number;
}

interface StyleActions {
  setInkColor: (value: string) => void;
  setInkWidth: (value: number) => void;
  setHighlightColor: (value: string) => void;
  setHighlightOpacity: (value: number) => void;
  setFreehandHighlighterWidth: (value: number) => void;
  setUnderlineColor: (value: string) => void;
  setUnderlineOpacity: (value: number) => void;
  setStrikeoutColor: (value: string) => void;
  setStrikeoutOpacity: (value: number) => void;
  setSquigglyColor: (value: string) => void;
  setSquigglyOpacity: (value: number) => void;
  setTextColor: (value: string) => void;
  setTextSize: (value: number) => void;
  setTextAlignment: (value: 'left' | 'center' | 'right') => void;
  setTextBackgroundColor: (value: string) => void;
  setNoteBackgroundColor: (value: string) => void;
  setShapeStrokeColor: (value: string) => void;
  setShapeFillColor: (value: string) => void;
  setShapeOpacity: (value: number) => void;
  setShapeStrokeOpacity: (value: number) => void;
  setShapeFillOpacity: (value: number) => void;
  setShapeThickness: (value: number) => void;
}

type BuildToolOptionsFn = (toolId: AnnotationToolId, extras?: any) => Record<string, unknown>;

type ColorTarget =
  | 'ink'
  | 'highlight'
  | 'inkHighlighter'
  | 'underline'
  | 'strikeout'
  | 'squiggly'
  | 'text'
  | 'textBackground'
  | 'noteBackground'
  | 'shapeStroke'
  | 'shapeFill'
  | null;

interface AnnotationPanelProps {
  activeTool: AnnotationToolId;
  activateAnnotationTool: (toolId: AnnotationToolId) => void;
  styleState: StyleState;
  styleActions: StyleActions;
  getActiveColor: (tool: AnnotationToolId) => string;
  buildToolOptions: BuildToolOptionsFn;
  deriveToolFromAnnotation: (annotation: any) => AnnotationToolId | undefined;
  selectedAnn: any | null;
  selectedTextDraft: string;
  setSelectedTextDraft: (text: string) => void;
  selectedFontSize: number;
  setSelectedFontSize: (size: number) => void;
  annotationApiRef: React.RefObject<AnnotationAPI | null>;
  signatureApiRef: React.RefObject<any>;
  viewerContext: any;
  setPlacementMode: (value: boolean) => void;
  setSignatureConfig: (config: any) => void;
  computeStampDisplaySize: (natural: { width: number; height: number } | null) => { width: number; height: number };
  stampImageData?: string;
  setStampImageData: (value: string | undefined) => void;
  stampImageSize: { width: number; height: number } | null;
  setStampImageSize: (value: { width: number; height: number } | null) => void;
  setPlacementPreviewSize: (value: { width: number; height: number } | null) => void;
  undo: () => void;
  redo: () => void;
  historyAvailability: { canUndo: boolean; canRedo: boolean };
  onApplyChanges: () => void;
  applyDisabled: boolean;
}

// AnnotationPanel component extracted from Annotate.tsx to keep the main file smaller.
export function AnnotationPanel(props: AnnotationPanelProps) {
  const { t } = useTranslation();
  const [colorPickerTarget, setColorPickerTarget] = useState<ColorTarget>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const {
    activeTool,
    activateAnnotationTool,
    styleState,
    styleActions,
    getActiveColor,
    buildToolOptions,
    deriveToolFromAnnotation,
    selectedAnn,
    annotationApiRef,
    viewerContext,
    setPlacementMode,
    setSignatureConfig,
    computeStampDisplaySize,
    stampImageData,
    setStampImageData,
    setStampImageSize,
    setPlacementPreviewSize,
    undo,
    redo,
    historyAvailability,
    onApplyChanges,
    applyDisabled,
  } = props;

  const {
    inkColor,
    inkWidth,
    highlightColor,
    highlightOpacity,
    freehandHighlighterWidth,
    underlineColor,
    underlineOpacity,
    strikeoutColor,
    strikeoutOpacity,
    squigglyColor,
    squigglyOpacity,
    textColor,
    textSize,
    textAlignment,
    textBackgroundColor,
    noteBackgroundColor,
    shapeStrokeColor,
    shapeFillColor,
    shapeOpacity,
    shapeStrokeOpacity,
    shapeFillOpacity,
    shapeThickness,
  } = styleState;

  const {
    setInkColor,
    setInkWidth,
    setHighlightColor,
    setHighlightOpacity,
    setFreehandHighlighterWidth,
    setUnderlineColor,
    setUnderlineOpacity,
    setStrikeoutColor,
    setStrikeoutOpacity,
    setSquigglyColor,
    setSquigglyOpacity,
    setTextColor,
    setTextSize,
    setTextAlignment,
    setTextBackgroundColor,
    setNoteBackgroundColor,
    setShapeStrokeColor,
    setShapeFillColor,
    setShapeOpacity,
    setShapeStrokeOpacity,
    setShapeFillOpacity,
    setShapeThickness,
  } = styleActions;

  const textMarkupTools: { id: AnnotationToolId; label: string; icon: string }[] = [
    { id: 'highlight', label: t('annotation.highlight', 'Highlight'), icon: 'highlight' },
    { id: 'underline', label: t('annotation.underline', 'Underline'), icon: 'format-underlined' },
    { id: 'strikeout', label: t('annotation.strikeout', 'Strikeout'), icon: 'strikethrough-s' },
    { id: 'squiggly', label: t('annotation.squiggly', 'Squiggly'), icon: 'show-chart' },
  ];

  const drawingTools: { id: AnnotationToolId; label: string; icon: string }[] = [
    { id: 'ink', label: t('annotation.pen', 'Pen'), icon: 'edit' },
    { id: 'inkHighlighter', label: t('annotation.freehandHighlighter', 'Freehand Highlighter'), icon: 'brush' },
  ];

  const shapeTools: { id: AnnotationToolId; label: string; icon: string }[] = [
    { id: 'square', label: t('annotation.square', 'Square'), icon: 'crop-square' },
    { id: 'circle', label: t('annotation.circle', 'Circle'), icon: 'radio-button-unchecked' },
    { id: 'line', label: t('annotation.line', 'Line'), icon: 'show-chart' },
    { id: 'polygon', label: t('annotation.polygon', 'Polygon'), icon: 'change-history' },
  ];

  const otherTools: { id: AnnotationToolId; label: string; icon: string }[] = [
    { id: 'text', label: t('annotation.text', 'Text box'), icon: 'text-fields' },
    { id: 'note', label: t('annotation.note', 'Note'), icon: 'sticky-note-2' },
    { id: 'stamp', label: t('annotation.stamp', 'Add Image'), icon: 'add-photo-alternate' },
  ];

  const activeColor = useMemo(() => colorPickerTarget ? getActiveColor(colorPickerTarget as AnnotationToolId) : '#000000', [colorPickerTarget, getActiveColor]);

  const renderToolButtons = (tools: { id: AnnotationToolId; label: string; icon: string }[]) => (
    <Group gap="xs">
      {tools.map((tool) => (
        <MantineTooltip key={tool.id} label={tool.label} withArrow>
          <ActionIcon
            variant={activeTool === tool.id ? 'filled' : 'subtle'}
            color={activeTool === tool.id ? 'blue' : undefined}
            radius="md"
            onClick={() => activateAnnotationTool(tool.id)}
            aria-label={tool.label}
          >
            <LocalIcon icon={tool.icon} width="1.25rem" height="1.25rem" />
          </ActionIcon>
        </MantineTooltip>
      ))}
    </Group>
  );

  const defaultStyleControls = (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="sm">
        {activeTool === 'select' ? (
          <>
            <Text size="sm" fw={600}>{t('annotation.selectAndMove', 'Select and Edit')}</Text>
            <Text size="xs" c="dimmed">
              {t('annotation.editSelectDescription', 'Click an existing annotation to edit its color, opacity, text, or size.')}
            </Text>
          </>
        ) : activeTool === 'stamp' ? (
          <>
            <Text size="sm" fw={600}>{t('annotation.stampSettings', 'Stamp Settings')}</Text>
            <ImageUploader
              onImageChange={async (file) => {
                if (file) {
                  try {
                    const dataUrl: string = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    });

                    const naturalSize = await new Promise<{ width: number; height: number } | null>((resolve) => {
                      const img = new Image();
                      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
                      img.onerror = () => resolve(null);
                      img.src = dataUrl;
                    });

                    const displaySize = computeStampDisplaySize(naturalSize);
                    setStampImageData(dataUrl);
                    setStampImageSize(displaySize);
                    setPlacementPreviewSize(displaySize);

                    setSignatureConfig({
                      signatureType: 'image',
                      signatureData: dataUrl,
                    });

                    setTimeout(() => {
                      viewerContext?.setAnnotationMode(true);
                      setPlacementMode(true);
                      const stampOptions = buildToolOptions('stamp', {
                        stampImageData: dataUrl,
                        stampImageSize: displaySize,
                      });
                        annotationApiRef?.current?.setAnnotationStyle?.('stamp', stampOptions);
                        annotationApiRef?.current?.activateAnnotationTool?.('stamp', stampOptions);
                    }, 150);
                  } catch (err) {
                    console.error('Failed to load stamp image', err);
                  }
                } else {
                  setStampImageData(undefined);
                  setStampImageSize(null);
                  setPlacementMode(false);
                  setSignatureConfig(null);
                  setPlacementPreviewSize(null);
                }
              }}
              disabled={false}
            />
            {stampImageData && (
              <Stack gap="xs">
                <Text size="xs" c="dimmed">{t('annotation.imagePreview', 'Preview')}</Text>
                <img
                  src={stampImageData}
                  alt="Stamp preview"
                  style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </Stack>
            )}
          </>
        ) : (
          <>
            <Text size="sm" fw={600}>{t('annotation.settings', 'Settings')}</Text>
            <Group gap="md">
              <Stack gap={4} align="center">
                <Text size="xs" c="dimmed">
                  {['square', 'circle', 'polygon'].includes(activeTool)
                    ? t('annotation.strokeColor', 'Stroke Color')
                    : t('annotation.color', 'Color')
                  }
                </Text>
                <ColorSwatchButton
                  color={
                    activeTool === 'ink'
                      ? inkColor
                      : activeTool === 'highlight' || activeTool === 'inkHighlighter'
                        ? highlightColor
                        : activeTool === 'underline'
                          ? underlineColor
                          : activeTool === 'strikeout'
                            ? strikeoutColor
                            : activeTool === 'squiggly'
                              ? squigglyColor
                              : ['square', 'circle', 'line', 'polygon'].includes(activeTool)
                                ? shapeStrokeColor
                                : textColor
                  }
                  size={30}
                  onClick={() => {
                    const target: ColorTarget =
                      activeTool === 'ink'
                        ? 'ink'
                        : activeTool === 'highlight' || activeTool === 'inkHighlighter'
                          ? 'highlight'
                          : activeTool === 'underline'
                            ? 'underline'
                            : activeTool === 'strikeout'
                              ? 'strikeout'
                              : activeTool === 'squiggly'
                                ? 'squiggly'
                                : ['square', 'circle', 'line', 'polygon'].includes(activeTool)
                                  ? 'shapeStroke'
                                  : 'text';
                    setColorPickerTarget(target);
                    setIsColorPickerOpen(true);
                  }}
                />
              </Stack>
              {['square', 'circle', 'polygon'].includes(activeTool) && (
                <Stack gap={4} align="center">
                  <Text size="xs" c="dimmed">{t('annotation.fillColor', 'Fill Color')}</Text>
                  <ColorSwatchButton
                    color={shapeFillColor}
                    size={30}
                    onClick={() => {
                      setColorPickerTarget('shapeFill');
                      setIsColorPickerOpen(true);
                    }}
                  />
                </Stack>
              )}
            </Group>

            {activeTool === 'ink' && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Width')}</Text>
                <Slider min={1} max={12} value={inkWidth} onChange={setInkWidth} />
              </Box>
            )}

            {(activeTool === 'highlight' || activeTool === 'inkHighlighter') && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
                <Slider min={10} max={100} value={highlightOpacity} onChange={setHighlightOpacity} />
              </Box>
            )}

            {activeTool === 'underline' && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
                <Slider min={10} max={100} value={underlineOpacity} onChange={setUnderlineOpacity} />
              </Box>
            )}

            {activeTool === 'inkHighlighter' && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Width')}</Text>
                <Slider min={1} max={20} value={freehandHighlighterWidth} onChange={setFreehandHighlighterWidth} />
              </Box>
            )}

            {activeTool === 'text' && (
              <>
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>{t('annotation.fontSize', 'Font size')}</Text>
                  <Slider min={8} max={32} value={textSize} onChange={setTextSize} />
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>{t('annotation.textAlignment', 'Text Alignment')}</Text>
                  <Group gap="xs">
                    <ActionIcon
                      variant={textAlignment === 'left' ? 'filled' : 'default'}
                      onClick={() => setTextAlignment('left')}
                      size="md"
                    >
                      <LocalIcon icon="format-align-left" width={18} height={18} />
                    </ActionIcon>
                    <ActionIcon
                      variant={textAlignment === 'center' ? 'filled' : 'default'}
                      onClick={() => setTextAlignment('center')}
                      size="md"
                    >
                      <LocalIcon icon="format-align-center" width={18} height={18} />
                    </ActionIcon>
                    <ActionIcon
                      variant={textAlignment === 'right' ? 'filled' : 'default'}
                      onClick={() => setTextAlignment('right')}
                      size="md"
                    >
                      <LocalIcon icon="format-align-right" width={18} height={18} />
                    </ActionIcon>
                  </Group>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>{t('annotation.backgroundColor', 'Background color')}</Text>
                  <Group gap="xs" align="center">
                    <ColorSwatchButton
                      color={textBackgroundColor || '#ffffff'}
                      size={30}
                      onClick={() => {
                        setColorPickerTarget('textBackground');
                        setIsColorPickerOpen(true);
                      }}
                    />
                    <Button
                      size="xs"
                      variant={textBackgroundColor ? 'light' : 'default'}
                      onClick={() => {
                        setTextBackgroundColor('');
                        annotationApiRef?.current?.setAnnotationStyle?.('text', buildToolOptions('text'));
                        if (selectedAnn?.object?.type === 3 && deriveToolFromAnnotation(selectedAnn.object) !== 'note') {
                          annotationApiRef?.current?.updateAnnotation?.(
                            selectedAnn.object?.pageIndex ?? 0,
                            selectedAnn.object?.id,
                            { backgroundColor: 'transparent', fillColor: 'transparent' }
                          );
                        }
                      }}
                    >
                      {textBackgroundColor ? t('annotation.clearBackground', 'Remove background') : t('annotation.noBackground', 'No background')}
                    </Button>
                  </Group>
                </Box>
              </>
            )}

            {activeTool === 'note' && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.backgroundColor', 'Background color')}</Text>
                <Group gap="xs" align="center">
                  <ColorSwatchButton
                    color={noteBackgroundColor || '#ffffff'}
                    size={30}
                    onClick={() => {
                      setColorPickerTarget('noteBackground');
                      setIsColorPickerOpen(true);
                    }}
                  />
                  <Button
                    size="xs"
                    variant={noteBackgroundColor ? 'light' : 'default'}
                    onClick={() => {
                      setNoteBackgroundColor('');
                      annotationApiRef?.current?.setAnnotationStyle?.('note', buildToolOptions('note'));
                      if (selectedAnn?.object?.type === 3 && deriveToolFromAnnotation(selectedAnn.object) === 'note') {
                        annotationApiRef?.current?.updateAnnotation?.(
                          selectedAnn.object?.pageIndex ?? 0,
                          selectedAnn.object?.id,
                          { backgroundColor: 'transparent', fillColor: 'transparent' }
                        );
                      }
                    }}
                  >
                    {noteBackgroundColor ? t('annotation.clearBackground', 'Remove background') : t('annotation.noBackground', 'No background')}
                  </Button>
                </Group>
              </Box>
            )}

            {['square', 'circle', 'line', 'polygon'].includes(activeTool) && (
              <>
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
                  <Slider
                    min={10}
                    max={100}
                    value={shapeOpacity}
                    onChange={(value) => {
                      setShapeOpacity(value);
                      setShapeStrokeOpacity(value);
                      setShapeFillOpacity(value);
                    }}
                  />
                </Box>
                <Box>
                  {activeTool === 'line' ? (
                    <>
                      <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Width')}</Text>
                      <Slider min={1} max={12} value={shapeThickness} onChange={setShapeThickness} />
                    </>
                  ) : (
                    <Group gap="xs" align="flex-end">
                      <Box style={{ flex: 1 }}>
                        <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Stroke')}</Text>
                        <Slider min={0} max={12} value={shapeThickness} onChange={setShapeThickness} />
                      </Box>
                      <Button
                        size="xs"
                        variant={shapeThickness === 0 ? 'filled' : 'light'}
                        onClick={() => setShapeThickness(shapeThickness === 0 ? 1 : 0)}
                      >
                        {shapeThickness === 0
                          ? t('annotation.borderOff', 'Border: Off')
                          : t('annotation.borderOn', 'Border: On')
                        }
                      </Button>
                    </Group>
                  )}
                </Box>
              </>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );

  const colorPickerComponent = (
    <ColorPicker
      isOpen={isColorPickerOpen}
      onClose={() => setIsColorPickerOpen(false)}
      selectedColor={activeColor}
      showOpacity={
        colorPickerTarget !== 'text' &&
        colorPickerTarget !== 'textBackground' &&
        colorPickerTarget !== 'noteBackground' &&
        colorPickerTarget !== 'shapeStroke' &&
        colorPickerTarget !== 'shapeFill' &&
        colorPickerTarget !== 'underline' &&
        colorPickerTarget !== null
      }
      opacity={
        colorPickerTarget === 'highlight' ? highlightOpacity :
        colorPickerTarget === 'underline' ? underlineOpacity :
        colorPickerTarget === 'strikeout' ? strikeoutOpacity :
        colorPickerTarget === 'squiggly' ? squigglyOpacity :
        colorPickerTarget === 'shapeStroke' ? shapeStrokeOpacity :
        colorPickerTarget === 'shapeFill' ? shapeFillOpacity :
        100
      }
      opacityLabel={
        colorPickerTarget === 'shapeStroke' ? t('annotation.strokeOpacity', 'Stroke Opacity') :
        colorPickerTarget === 'shapeFill' ? t('annotation.fillOpacity', 'Fill Opacity') :
        undefined
      }
      onOpacityChange={(opacity) => {
        if (colorPickerTarget === 'highlight') {
          setHighlightOpacity(opacity);
          if (activeTool === 'highlight' || activeTool === 'inkHighlighter') {
            annotationApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
          }
          if (selectedAnn?.object?.id && (selectedAnn.object?.type === 9 || selectedAnn.object?.type === 15)) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
          }
        } else if (colorPickerTarget === 'underline') {
          setUnderlineOpacity(opacity);
          annotationApiRef?.current?.setAnnotationStyle?.('underline', buildToolOptions('underline'));
          if (selectedAnn?.object?.id && selectedAnn.object?.type === 10) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
          }
        } else if (colorPickerTarget === 'strikeout') {
          setStrikeoutOpacity(opacity);
          annotationApiRef?.current?.setAnnotationStyle?.('strikeout', buildToolOptions('strikeout'));
          if (selectedAnn?.object?.id && selectedAnn.object?.type === 12) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
          }
        } else if (colorPickerTarget === 'squiggly') {
          setSquigglyOpacity(opacity);
          annotationApiRef?.current?.setAnnotationStyle?.('squiggly', buildToolOptions('squiggly'));
          if (selectedAnn?.object?.id && selectedAnn.object?.type === 11) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
          }
        } else if (colorPickerTarget === 'shapeStroke') {
          setShapeStrokeOpacity(opacity);
          const shapeToolsList = ['square', 'circle', 'polygon'] as AnnotationToolId[];
          if (shapeToolsList.includes(activeTool)) {
            annotationApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
          }
        } else if (colorPickerTarget === 'shapeFill') {
          setShapeFillOpacity(opacity);
          const fillShapeTools = ['square', 'circle', 'polygon'] as AnnotationToolId[];
          if (fillShapeTools.includes(activeTool)) {
            annotationApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
          }
        }
      }}
      onColorChange={(color) => {
        if (colorPickerTarget === 'ink') {
          setInkColor(color);
          if (activeTool === 'ink') {
            annotationApiRef?.current?.setAnnotationStyle?.('ink', buildToolOptions('ink'));
          }
          if (selectedAnn?.object?.type === 15) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
          }
        } else if (colorPickerTarget === 'highlight') {
          setHighlightColor(color);
          if (activeTool === 'highlight' || activeTool === 'inkHighlighter') {
            annotationApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
          }
          if (selectedAnn?.object?.type === 9 || selectedAnn?.object?.type === 15) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
          }
        } else if (colorPickerTarget === 'underline') {
          setUnderlineColor(color);
          annotationApiRef?.current?.setAnnotationStyle?.('underline', buildToolOptions('underline'));
          if (selectedAnn?.object?.id) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
          }
        } else if (colorPickerTarget === 'strikeout') {
          setStrikeoutColor(color);
          annotationApiRef?.current?.setAnnotationStyle?.('strikeout', buildToolOptions('strikeout'));
          if (selectedAnn?.object?.id) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
          }
        } else if (colorPickerTarget === 'squiggly') {
          setSquigglyColor(color);
          annotationApiRef?.current?.setAnnotationStyle?.('squiggly', buildToolOptions('squiggly'));
          if (selectedAnn?.object?.id) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
          }
        } else if (colorPickerTarget === 'textBackground') {
          setTextBackgroundColor(color);
          if (activeTool === 'text') {
            annotationApiRef?.current?.setAnnotationStyle?.('text', buildToolOptions('text'));
          }
          if (selectedAnn?.object?.type === 3 && deriveToolFromAnnotation(selectedAnn.object) !== 'note') {
            annotationApiRef?.current?.updateAnnotation?.(
              selectedAnn.object?.pageIndex ?? 0,
              selectedAnn.object?.id,
              { backgroundColor: color, fillColor: color }
            );
          }
        } else if (colorPickerTarget === 'noteBackground') {
          setNoteBackgroundColor(color);
          if (activeTool === 'note') {
            annotationApiRef?.current?.setAnnotationStyle?.('note', buildToolOptions('note'));
          }
          if (selectedAnn?.object?.type === 3 && deriveToolFromAnnotation(selectedAnn.object) === 'note') {
            annotationApiRef?.current?.updateAnnotation?.(
              selectedAnn.object?.pageIndex ?? 0,
              selectedAnn.object?.id,
              { backgroundColor: color, fillColor: color }
            );
          }
        } else {
          setTextColor(color);
          if (activeTool === 'text') {
            annotationApiRef?.current?.setAnnotationStyle?.('text', buildToolOptions('text'));
          }
          if (selectedAnn?.object?.type === 3 || selectedAnn?.object?.type === 1) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
              textColor: color,
              color,
            });
          }
        }

        const shapeToolsList = ['square', 'circle', 'line', 'lineArrow', 'polyline', 'polygon'] as AnnotationToolId[];
        const fillShapeTools = ['square', 'circle', 'polygon'] as AnnotationToolId[];

        if (colorPickerTarget === 'shapeStroke') {
          setShapeStrokeColor(color);
          const styleTool = shapeToolsList.includes(activeTool) ? activeTool : null;
          if (styleTool) {
            annotationApiRef?.current?.setAnnotationStyle?.(styleTool, buildToolOptions(styleTool));
          }
          if (selectedAnn?.object?.id) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
              strokeColor: color,
              color: selectedAnn.object?.color ?? shapeFillColor,
              borderWidth: shapeThickness,
            });
          }
        }
        if (colorPickerTarget === 'shapeFill') {
          setShapeFillColor(color);
          const styleTool = fillShapeTools.includes(activeTool) ? activeTool : null;
          if (styleTool) {
            annotationApiRef?.current?.setAnnotationStyle?.(styleTool, buildToolOptions(styleTool));
          }
          if (selectedAnn?.object?.id) {
            annotationApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
              color,
              strokeColor: selectedAnn.object?.strokeColor ?? shapeStrokeColor,
              borderWidth: shapeThickness,
            });
          }
        }
      }}
      title={t('annotation.chooseColor', 'Choose color')}
    />
  );

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={t('annotation.selectAndMove', 'Select and edit annotations')}>
          <ActionIcon
            variant={activeTool === 'select' ? 'filled' : 'default'}
            size="lg"
            onClick={() => {
              activateAnnotationTool('select');
            }}
            style={{
              width: 'auto',
              paddingInline: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <LocalIcon icon="touch-app-rounded" width={20} height={20} />
            <Text component="span" size="sm" fw={500}>
              {t('annotation.selectAndMove', 'Select and Edit')}
            </Text>
          </ActionIcon>
        </Tooltip>

        <DrawingControls
          onUndo={undo}
          onRedo={redo}
          canUndo={historyAvailability.canUndo}
          canRedo={historyAvailability.canRedo}
          showPlaceButton={false}
          additionalControls={null}
        />
      </Group>

      <Box>
        <Text size="sm" fw={600} mb="xs">{t('annotation.textMarkup', 'Text Markup')}</Text>
        {renderToolButtons(textMarkupTools)}
      </Box>

      <Box>
        <Text size="sm" fw={600} mb="xs">{t('annotation.drawing', 'Drawing')}</Text>
        {renderToolButtons(drawingTools)}
      </Box>

      <Box>
        <Text size="sm" fw={600} mb="xs">{t('annotation.shapes', 'Shapes')}</Text>
        {renderToolButtons(shapeTools)}
      </Box>

      <Box>
        <Text size="sm" fw={600} mb="xs">{t('annotation.notesStamps', 'Notes & Stamps')}</Text>
        {renderToolButtons(otherTools)}
      </Box>

      {activeTool === 'stamp' && defaultStyleControls}

      {colorPickerComponent}

      <Button
        fullWidth
        size="md"
        radius="md"
        mt="sm"
        variant="filled"
        color="blue"
        disabled={applyDisabled}
        onClick={onApplyChanges}
      >
        {t('annotation.saveChanges', 'Save Changes')}
      </Button>

      <SuggestedToolsSection />
    </Stack>
  );
}
