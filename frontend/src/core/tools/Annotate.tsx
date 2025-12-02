import { useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, Group, ActionIcon, Stack, Divider, Slider, Box, Tooltip as MantineTooltip, Button, TextInput, NumberInput } from '@mantine/core';

import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useNavigation } from '@app/contexts/NavigationContext';
import { useFileSelection, useFileContext } from '@app/contexts/FileContext';
import { BaseToolProps } from '@app/types/tool';
import { useSignature } from '@app/contexts/SignatureContext';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { ColorPicker, ColorSwatchButton } from '@app/components/annotation/shared/ColorPicker';
import LocalIcon from '@app/components/shared/LocalIcon';
import type { AnnotationToolId } from '@app/components/viewer/viewerTypes';

const Annotate = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setToolAndWorkbench } = useNavigation();
  const { selectedFiles } = useFileSelection();
  const { selectors } = useFileContext();
  const { signatureApiRef } = useSignature();
  const viewerContext = useContext(ViewerContext);

  const [activeTool, setActiveTool] = useState<AnnotationToolId>('highlight');
  const [inkColor, setInkColor] = useState('#1f2933');
  const [inkWidth, setInkWidth] = useState(2);
  const [highlightColor, setHighlightColor] = useState('#ffd54f');
  const [highlightOpacity, setHighlightOpacity] = useState(60);
  const [underlineColor, setUnderlineColor] = useState('#ffb300');
  const [strikeoutColor, setStrikeoutColor] = useState('#e53935');
  const [squigglyColor, setSquigglyColor] = useState('#00acc1');
  const [textColor, setTextColor] = useState('#111111');
  const [textSize, setTextSize] = useState(14);
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#1565c0');
  const [shapeFillColor, setShapeFillColor] = useState('#e3f2fd');
  const [shapeOpacity, setShapeOpacity] = useState(35);
  const [shapeThickness, setShapeThickness] = useState(2);
  const [colorPickerTarget, setColorPickerTarget] = useState<'ink' | 'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'text' | 'shapeStroke' | 'shapeFill' | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<any | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [selectedTextDraft, setSelectedTextDraft] = useState<string>('');
  const [selectedFontSize, setSelectedFontSize] = useState<number>(14);
  const selectedUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stampInputRef = useRef<HTMLInputElement | null>(null);

  const buildToolOptions = useCallback((toolId: AnnotationToolId) => {
    switch (toolId) {
      case 'ink':
        return { color: inkColor, thickness: inkWidth };
      case 'inkHighlighter':
        return { color: highlightColor, opacity: highlightOpacity / 100, thickness: 6 };
      case 'highlight':
        return { color: highlightColor, opacity: highlightOpacity / 100 };
      case 'underline':
        return { color: underlineColor, opacity: 1 };
      case 'strikeout':
        return { color: strikeoutColor, opacity: 1 };
      case 'squiggly':
        return { color: squigglyColor, opacity: 1 };
      case 'text':
        return { color: textColor, fontSize: textSize };
      case 'note':
        return { color: textColor };
      case 'square':
      case 'circle':
      case 'polygon':
        return {
          color: shapeStrokeColor,
          interiorColor: shapeFillColor,
          opacity: shapeOpacity / 100,
          borderWidth: shapeThickness,
        };
      case 'line':
      case 'polyline':
      case 'lineArrow':
        return {
          color: shapeStrokeColor,
          opacity: shapeOpacity / 100,
          borderWidth: shapeThickness,
        };
      default:
        return {};
    }
  }, [highlightColor, highlightOpacity, inkColor, inkWidth, underlineColor, strikeoutColor, squigglyColor, textColor, textSize, shapeStrokeColor, shapeFillColor, shapeOpacity, shapeThickness]);

  useEffect(() => {
    setToolAndWorkbench('annotate', 'viewer');
  }, [setToolAndWorkbench]);

  useEffect(() => {
    if (!viewerContext) return;
    if (viewerContext.isAnnotationMode) return;

    viewerContext.setAnnotationMode(true);
    signatureApiRef?.current?.activateAnnotationTool?.(activeTool, buildToolOptions(activeTool));
  }, [viewerContext?.isAnnotationMode, signatureApiRef, activeTool, buildToolOptions]);

  const activateAnnotationTool = (toolId: AnnotationToolId) => {
    viewerContext?.setAnnotationMode(true);
    setActiveTool(toolId);
    const options = buildToolOptions(toolId);
    signatureApiRef?.current?.activateAnnotationTool?.(toolId, options);

    if (toolId === 'stamp') {
      // Use existing add image flow for stamp assets
      if (stampInputRef.current) {
        stampInputRef.current.click();
      }
    }
  };

  useEffect(() => {
    // push style updates to EmbedPDF when sliders/colors change
    signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
  }, [activeTool, buildToolOptions, signatureApiRef]);

  // Allow exiting multi-point tools with Escape (e.g., polyline)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (['polyline', 'polygon'].includes(activeTool)) {
        signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
        signatureApiRef?.current?.activateAnnotationTool?.(null as any);
        setTimeout(() => {
          signatureApiRef?.current?.activateAnnotationTool?.(activeTool, buildToolOptions(activeTool));
        }, 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, buildToolOptions, signatureApiRef]);

  // Poll selected annotation to allow editing existing highlights/text
  useEffect(() => {
    const interval = setInterval(() => {
      const ann = signatureApiRef?.current?.getSelectedAnnotation?.();
      const annId = ann?.object?.id ?? null;
      setSelectedAnn(ann || null);
      // Only reset drafts when selection changes
      if (annId !== selectedAnnId) {
        setSelectedAnnId(annId);
        if (ann?.object?.contents !== undefined) {
          setSelectedTextDraft(ann.object.contents ?? '');
        }
        if (ann?.object?.fontSize !== undefined) {
          setSelectedFontSize(ann.object.fontSize ?? 14);
        }
      }
    }, 150);
    return () => clearInterval(interval);
  }, [signatureApiRef, selectedAnnId]);

  const annotationTools: { id: AnnotationToolId; label: string; icon: string }[] = [
    { id: 'highlight', label: t('annotation.highlight', 'Highlight'), icon: 'highlight' },
    { id: 'underline', label: t('annotation.underline', 'Underline'), icon: 'format-underlined' },
    { id: 'strikeout', label: t('annotation.strikeout', 'Strikeout'), icon: 'strikethrough-s' },
    { id: 'squiggly', label: t('annotation.squiggly', 'Squiggly'), icon: 'show-chart' },
    { id: 'ink', label: t('annotation.pen', 'Pen'), icon: 'edit' },
    { id: 'inkHighlighter', label: t('annotation.inkHighlighter', 'Ink Highlighter'), icon: 'brush' },
    { id: 'text', label: t('annotation.text', 'Text box'), icon: 'text-fields' },
    { id: 'note', label: t('annotation.note', 'Note'), icon: 'sticky-note-2' },
    { id: 'square', label: t('annotation.square', 'Square'), icon: 'crop-square' },
    { id: 'circle', label: t('annotation.circle', 'Circle'), icon: 'radio-button-unchecked' },
    { id: 'line', label: t('annotation.line', 'Line'), icon: 'show-chart' },
    { id: 'lineArrow', label: t('annotation.arrow', 'Arrow'), icon: 'trending-flat' },
    { id: 'polyline', label: t('annotation.polyline', 'Polyline'), icon: 'polyline' },
    { id: 'polygon', label: t('annotation.polygon', 'Polygon'), icon: 'change-history' },
    { id: 'stamp', label: t('annotation.stamp', 'Stamp'), icon: 'image' },
  ];

  const activeColor =
    colorPickerTarget === 'ink'
      ? inkColor
      : colorPickerTarget === 'highlight' || colorPickerTarget === 'inkHighlighter'
        ? highlightColor
        : colorPickerTarget === 'underline'
          ? underlineColor
          : colorPickerTarget === 'strikeout'
            ? strikeoutColor
            : colorPickerTarget === 'squiggly'
              ? squigglyColor
              : colorPickerTarget === 'shapeStroke'
                ? shapeStrokeColor
                : colorPickerTarget === 'shapeFill'
                  ? shapeFillColor
                  : textColor;

  const steps = useMemo(() => {
    if (selectedFiles.length === 0) return [];

    const toolButtons = (
      <Group gap="xs">
        {annotationTools.map((tool) => (
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

    const controls = (
      <Stack gap="sm">
        <Group gap="sm" align="center">
          <input
            ref={stampInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const dataUrl: string = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                // push into stamp defaults and activate stamp tool
                signatureApiRef?.current?.setAnnotationStyle?.('stamp', { imageSrc: dataUrl as string });
                signatureApiRef?.current?.activateAnnotationTool?.('stamp', { imageSrc: dataUrl as string });
                setActiveTool('stamp');
              } catch (err) {
                console.error('Failed to load stamp image', err);
              } finally {
                e.target.value = '';
              }
            }}
          />
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
                        : shapeStrokeColor
            }
            size={30}
            onClick={() => {
              const target =
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
                  : ['square', 'circle', 'line', 'lineArrow', 'polyline', 'polygon'].includes(activeTool)
                    ? 'shapeStroke'
                    : 'text';
              setColorPickerTarget(target);
              setIsColorPickerOpen(true);
            }}
          />
          {['square', 'circle', 'polygon'].includes(activeTool) && (
            <ColorSwatchButton
              color={shapeFillColor}
              size={30}
              onClick={() => {
                setColorPickerTarget('shapeFill');
                setIsColorPickerOpen(true);
              }}
            />
          )}
          {activeTool === 'ink' && (
            <>
              <Text size="sm" c="dimmed">{t('annotation.strokeWidth', 'Width')}</Text>
              <Slider min={1} max={12} value={inkWidth} onChange={setInkWidth} w={140} />
            </>
          )}
          {(activeTool === 'highlight' || activeTool === 'inkHighlighter') && (
            <>
              <Text size="sm" c="dimmed">{t('annotation.opacity', 'Opacity')}</Text>
              <Slider min={10} max={100} value={highlightOpacity} onChange={setHighlightOpacity} w={140} />
            </>
          )}
          {activeTool === 'text' && (
            <>
              <Text size="sm" c="dimmed">{t('annotation.fontSize', 'Font size')}</Text>
              <Slider min={8} max={32} value={textSize} onChange={setTextSize} w={140} />
            </>
          )}
          {['square', 'circle', 'line', 'lineArrow', 'polyline', 'polygon'].includes(activeTool) && (
            <>
              <Text size="sm" c="dimmed">{t('annotation.opacity', 'Opacity')}</Text>
              <Slider min={10} max={100} value={shapeOpacity} onChange={setShapeOpacity} w={140} />
              <Text size="sm" c="dimmed">{t('annotation.strokeWidth', 'Stroke')}</Text>
              <Slider min={1} max={12} value={shapeThickness} onChange={setShapeThickness} w={140} />
            </>
          )}
        </Group>
        <Divider />
        <Text size="sm" c="dimmed">
          {t('annotation.tipPlace', 'Click anywhere on the PDF to place highlights, drawings, notes, or text.')}
        </Text>
          {selectedAnn && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>{t('annotation.editSelected', 'Edit selected annotation')}</Text>
              {(selectedAnn.object?.type === 9 || selectedAnn.object?.type === 1 || selectedAnn.object?.type === 3 || selectedAnn.object?.type === 15) && (
                <>
                  <Text size="xs" c="dimmed">{t('annotation.opacity', 'Opacity')}</Text>
                <Slider
                  min={10}
                  max={100}
                  value={Math.round(((selectedAnn.object?.opacity ?? 1) * 100) || 100)}
                  onChange={(value) => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      { opacity: value / 100 }
                    );
                  }}
                />
              </>
              )}
              {(selectedAnn.object?.type === 9 || selectedAnn.object?.type === 15 || selectedAnn.object?.type === 3 || selectedAnn.object?.type === 1) && (
                <ColorSwatchButton
                  color={selectedAnn.object?.color ?? selectedAnn.object?.textColor ?? highlightColor}
                  size={28}
                  onClick={() => {
                    setColorPickerTarget('highlight');
                    setIsColorPickerOpen(true);
                  }}
                />
              )}
              {(selectedAnn.object?.type === 3 || selectedAnn.object?.type === 1) && (
                <>
                  <TextInput
                    label={t('annotation.text', 'Text')}
                    value={selectedTextDraft}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setSelectedTextDraft(val);
                      if (selectedUpdateTimer.current) {
                        clearTimeout(selectedUpdateTimer.current);
                      }
                      selectedUpdateTimer.current = setTimeout(() => {
                        signatureApiRef?.current?.updateAnnotation?.(
                          selectedAnn.object?.pageIndex ?? 0,
                          selectedAnn.object?.id,
                          { contents: val, textColor: selectedAnn.object?.textColor ?? textColor }
                        );
                      }, 120);
                    }}
                  />
                  {selectedAnn.object?.type === 3 && (
                    <NumberInput
                      label={t('annotation.fontSize', 'Font size')}
                      min={6}
                      max={72}
                      value={selectedFontSize}
                      onChange={(val) => {
                        const size = typeof val === 'number' ? val : 14;
                        setSelectedFontSize(size);
                        signatureApiRef?.current?.updateAnnotation?.(
                          selectedAnn.object?.pageIndex ?? 0,
                          selectedAnn.object?.id,
                          { fontSize: size }
                        );
                      }}
                    />
                  )}
                </>
              )}
              {['4','5','7','8','12','15'].includes(String(selectedAnn.object?.type)) && (
                <>
                  <Text size="xs" c="dimmed">{t('annotation.opacity', 'Opacity')}</Text>
                  <Slider
                    min={10}
                    max={100}
                    value={Math.round(((selectedAnn.object?.opacity ?? 1) * 100) || 100)}
                    onChange={(value) => {
                      signatureApiRef?.current?.updateAnnotation?.(
                        selectedAnn.object?.pageIndex ?? 0,
                        selectedAnn.object?.id,
                        { opacity: value / 100 }
                      );
                    }}
                  />
                  <Text size="xs" c="dimmed">{t('annotation.strokeWidth', 'Stroke')}</Text>
                  <Slider
                    min={1}
                    max={12}
                    value={selectedAnn.object?.borderWidth ?? shapeThickness}
                    onChange={(value) => {
                      signatureApiRef?.current?.updateAnnotation?.(
                        selectedAnn.object?.pageIndex ?? 0,
                        selectedAnn.object?.id,
                        { borderWidth: value }
                      );
                      setShapeThickness(value);
                    }}
                  />
                  <Group gap="xs">
                    <ColorSwatchButton
                      color={selectedAnn.object?.color ?? shapeStrokeColor}
                      size={28}
                      onClick={() => {
                        setColorPickerTarget('shapeStroke');
                        setIsColorPickerOpen(true);
                      }}
                    />
                    {['4','5','7','8','12'].includes(String(selectedAnn.object?.type)) && (
                      <ColorSwatchButton
                        color={selectedAnn.object?.interiorColor ?? shapeFillColor}
                        size={28}
                        onClick={() => {
                          setColorPickerTarget('shapeFill');
                          setIsColorPickerOpen(true);
                        }}
                      />
                    )}
                  </Group>
                </>
              )}
            </Stack>
          )}
        <Button
          variant="light"
          leftSection={<LocalIcon icon="save" width="1rem" height="1rem" />}
          onClick={async () => {
            try {
              const pdfArrayBuffer = await viewerContext?.exportActions?.saveAsCopy?.();
              if (!pdfArrayBuffer) return;
              const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
              const fileName = selectors.getFiles()[0]?.name || 'annotated.pdf';
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = fileName;
              link.click();
              URL.revokeObjectURL(link.href);
            } catch (error) {
              console.error('Failed to save annotated PDF', error);
            }
          }}
        >
          {t('rightRail.save', 'Save')}
        </Button>
        <ColorPicker
          isOpen={isColorPickerOpen}
          onClose={() => setIsColorPickerOpen(false)}
          selectedColor={activeColor}
          onColorChange={(color) => {
            if (colorPickerTarget === 'ink') {
              setInkColor(color);
              if (activeTool === 'ink') {
                signatureApiRef?.current?.setAnnotationStyle?.('ink', buildToolOptions('ink'));
              }
              if (selectedAnn?.object?.type === 15) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
              }
            } else if (colorPickerTarget === 'highlight') {
              setHighlightColor(color);
              if (activeTool === 'highlight' || activeTool === 'inkHighlighter') {
                signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              }
              if (selectedAnn?.object?.type === 9 || selectedAnn?.object?.type === 15) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
              }
            } else if (colorPickerTarget === 'underline') {
              setUnderlineColor(color);
              signatureApiRef?.current?.setAnnotationStyle?.('underline', buildToolOptions('underline'));
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
              }
            } else if (colorPickerTarget === 'strikeout') {
              setStrikeoutColor(color);
              signatureApiRef?.current?.setAnnotationStyle?.('strikeout', buildToolOptions('strikeout'));
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
              }
            } else if (colorPickerTarget === 'squiggly') {
              setSquigglyColor(color);
              signatureApiRef?.current?.setAnnotationStyle?.('squiggly', buildToolOptions('squiggly'));
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { color });
              }
            } else {
              setTextColor(color);
              if (activeTool === 'text') {
                signatureApiRef?.current?.setAnnotationStyle?.('text', buildToolOptions('text'));
              }
              if (selectedAnn?.object?.type === 3 || selectedAnn?.object?.type === 1) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
                  textColor: color,
                  color,
                });
              }
            }
            if (colorPickerTarget === 'shapeStroke' && ['square', 'circle', 'line', 'lineArrow', 'polyline', 'polygon'].includes(activeTool)) {
              setShapeStrokeColor(color);
              signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
                  color,
                  strokeColor: color,
                  borderWidth: shapeThickness,
                });
              }
            }
            if (colorPickerTarget === 'shapeFill' && ['square', 'circle', 'polygon'].includes(activeTool)) {
              setShapeFillColor(color);
              signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              if (selectedAnn && (selectedAnn.object?.interiorColor !== undefined || ['4','5','7','8','12'].includes(String(selectedAnn.object?.type)))) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
                  interiorColor: color,
                  fillColor: color,
                  borderWidth: shapeThickness,
                });
              }
            }
          }}
          title={t('annotation.chooseColor', 'Choose color')}
        />
      </Stack>
    );

    return [
      {
        title: t('annotation.title', 'Annotate'),
        isCollapsed: false,
        onCollapsedClick: undefined,
        content: (
          <Stack gap="md">
            <Alert color="blue" radius="md">
              <Text size="sm" fw={600}>
                {t('annotation.desc', 'Use highlight, pen, text, and notes. Changes stay live—no flattening required.')}
              </Text>
            </Alert>
            <Box>
              <Text size="sm" mb="xs" fw={600}>{t('annotation.title', 'Annotate')}</Text>
              {toolButtons}
            </Box>
            {controls}
          </Stack>
        ),
      },
    ];
  }, [
    activeTool,
    annotationTools,
    highlightColor,
    highlightOpacity,
    inkColor,
    inkWidth,
    selectedFiles.length,
    t,
    selectedAnn,
    textColor,
    textSize,
    viewerContext?.exportActions,
    selectors,
  ]);

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: false,
    },
    steps,
    review: {
      isVisible: false,
      operation: { files: [], downloadUrl: null },
      title: '',
      onFileClick: () => {},
      onUndo: () => {},
    },
    forceStepNumbers: true,
  });
};

export default Annotate;
