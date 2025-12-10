import { useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, Group, ActionIcon, Stack, Divider, Slider, Box, Tooltip as MantineTooltip, Button, TextInput, Textarea, NumberInput, Tooltip } from '@mantine/core';

import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useNavigation } from '@app/contexts/NavigationContext';
import { useFileSelection, useFileContext } from '@app/contexts/FileContext';
import { BaseToolProps } from '@app/types/tool';
import { useSignature } from '@app/contexts/SignatureContext';
import { ViewerContext, useViewer } from '@app/contexts/ViewerContext';
import { ColorPicker, ColorSwatchButton } from '@app/components/annotation/shared/ColorPicker';
import { ImageUploader } from '@app/components/annotation/shared/ImageUploader';
import LocalIcon from '@app/components/shared/LocalIcon';
import type { AnnotationToolId } from '@app/components/viewer/viewerTypes';

const Annotate = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setToolAndWorkbench } = useNavigation();
  const { selectedFiles } = useFileSelection();
  const { selectors } = useFileContext();
  const {
    signatureApiRef,
    historyApiRef,
    undo,
    redo,
    setSignatureConfig,
    setPlacementMode,
    placementPreviewSize,
    activateSignaturePlacementMode,
  } = useSignature();
  const viewerContext = useContext(ViewerContext);
  const { getZoomState, registerImmediateZoomUpdate } = useViewer();

  const [activeTool, setActiveTool] = useState<AnnotationToolId>('highlight');
  const [inkColor, setInkColor] = useState('#1f2933');
  const [inkWidth, setInkWidth] = useState(2);
  const [highlightColor, setHighlightColor] = useState('#ffd54f');
  const [highlightOpacity, setHighlightOpacity] = useState(60);
  const [freehandHighlighterWidth, setFreehandHighlighterWidth] = useState(6);
  const [underlineColor, setUnderlineColor] = useState('#ffb300');
  const [underlineOpacity, setUnderlineOpacity] = useState(100);
  const [strikeoutColor, setStrikeoutColor] = useState('#e53935');
  const [strikeoutOpacity, setStrikeoutOpacity] = useState(100);
  const [squigglyColor, setSquigglyColor] = useState('#00acc1');
  const [squigglyOpacity, setSquigglyOpacity] = useState(100);
  const [textColor, setTextColor] = useState('#111111');
  const [textSize, setTextSize] = useState(14);
  const [textAlignment, setTextAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#cf5b5b');
  const [shapeFillColor, setShapeFillColor] = useState('#0000ff');
  const [shapeOpacity, setShapeOpacity] = useState(50);
  const [shapeStrokeOpacity, setShapeStrokeOpacity] = useState(50);
  const [shapeFillOpacity, setShapeFillOpacity] = useState(50);
  const [shapeThickness, setShapeThickness] = useState(1);
  const [colorPickerTarget, setColorPickerTarget] = useState<'ink' | 'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'text' | 'shapeStroke' | 'shapeFill' | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<any | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [selectedTextDraft, setSelectedTextDraft] = useState<string>('');
  const [selectedFontSize, setSelectedFontSize] = useState<number>(14);
  const selectedUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stampImageData, setStampImageData] = useState<string | undefined>();
  const [isAnnotationPaused, setIsAnnotationPaused] = useState(false);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const manualToolSwitch = useRef<boolean>(false);

  // Zoom tracking for stamp size conversion
  const [currentZoom, setCurrentZoom] = useState(() => getZoomState()?.currentZoom ?? 1);

  useEffect(() => {
    return registerImmediateZoomUpdate((newZoom) => {
      setCurrentZoom(newZoom);
    });
  }, [registerImmediateZoomUpdate]);

  // CSS to PDF size conversion accounting for zoom
  const cssToPdfSize = useCallback(
    (size: { width: number; height: number }) => {
      const zoom = currentZoom || 1;
      const factor = 1 / zoom;
      return {
        width: size.width * factor,
        height: size.height * factor,
      };
    },
    [currentZoom]
  );

  const buildToolOptions = useCallback((toolId: AnnotationToolId, includeMetadata: boolean = true) => {
    const metadata = includeMetadata ? {
      customData: {
        author: 'User', // Could be replaced with actual user name from auth context
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
    } : {};

    switch (toolId) {
      case 'ink':
        return { color: inkColor, thickness: inkWidth, ...metadata };
      case 'inkHighlighter':
        return { color: highlightColor, opacity: highlightOpacity / 100, thickness: freehandHighlighterWidth, ...metadata };
      case 'highlight':
        return { color: highlightColor, opacity: highlightOpacity / 100, ...metadata };
      case 'underline':
        return { color: underlineColor, opacity: underlineOpacity / 100, ...metadata };
      case 'strikeout':
        return { color: strikeoutColor, opacity: strikeoutOpacity / 100, ...metadata };
      case 'squiggly':
        return { color: squigglyColor, opacity: squigglyOpacity / 100, ...metadata };
      case 'text':
        return { color: textColor, fontSize: textSize, textAlign: textAlignment, ...metadata };
      case 'square':
      case 'circle':
      case 'polygon':
        return {
          color: shapeFillColor, // fill color
          strokeColor: shapeStrokeColor, // border color
          opacity: shapeOpacity / 100,
          strokeOpacity: shapeStrokeOpacity / 100,
          fillOpacity: shapeFillOpacity / 100,
          borderWidth: shapeThickness,
          ...metadata,
        };
      case 'line':
      case 'polyline':
      case 'lineArrow':
        return {
          color: shapeStrokeColor,
          strokeColor: shapeStrokeColor,
          opacity: shapeStrokeOpacity / 100,
          borderWidth: shapeThickness,
          ...metadata,
        };
      default:
        return {};
    }
  }, [highlightColor, highlightOpacity, inkColor, inkWidth, freehandHighlighterWidth, underlineColor, underlineOpacity, strikeoutColor, strikeoutOpacity, squigglyColor, squigglyOpacity, textColor, textSize, textAlignment, shapeStrokeColor, shapeFillColor, shapeOpacity, shapeStrokeOpacity, shapeFillOpacity, shapeThickness]);

  useEffect(() => {
    setToolAndWorkbench('annotate', 'viewer');
  }, [setToolAndWorkbench]);

  // Monitor history state for undo/redo availability
  useEffect(() => {
    const historyApi = historyApiRef?.current;
    if (!historyApi) return;

    const checkHistory = () => {
      setHistoryAvailability({
        canUndo: historyApi.canUndo?.() ?? false,
        canRedo: historyApi.canRedo?.() ?? false,
      });
    };

    checkHistory();
    const interval = setInterval(checkHistory, 200);
    return () => clearInterval(interval);
  }, [historyApiRef]);

  useEffect(() => {
    if (!viewerContext) return;
    if (viewerContext.isAnnotationMode) return;

    viewerContext.setAnnotationMode(true);
    signatureApiRef?.current?.activateAnnotationTool?.(activeTool, buildToolOptions(activeTool));
  }, [viewerContext?.isAnnotationMode, signatureApiRef, activeTool, buildToolOptions]);

  const activateAnnotationTool = (toolId: AnnotationToolId) => {
    // If leaving stamp tool, clean up placement mode
    if (activeTool === 'stamp' && toolId !== 'stamp') {
      setPlacementMode(false);
      setSignatureConfig(null);
    }

    viewerContext?.setAnnotationMode(true);

    // Mark as manual tool switch to prevent auto-switch back
    manualToolSwitch.current = true;

    // Deselect annotation in the viewer first
    signatureApiRef?.current?.deselectAnnotation?.();

    // Clear selection state to show default controls
    setSelectedAnn(null);
    setSelectedAnnId(null);

    // Change the tool
    setActiveTool(toolId);
    const options = buildToolOptions(toolId);

    // For stamp, apply the image if we have one
    if (toolId === 'stamp' && stampImageData) {
      signatureApiRef?.current?.setAnnotationStyle?.('stamp', { imageSrc: stampImageData });
      signatureApiRef?.current?.activateAnnotationTool?.('stamp', { imageSrc: stampImageData });
    } else {
      signatureApiRef?.current?.activateAnnotationTool?.(toolId, options);
    }

    // Reset flag after a short delay
    setTimeout(() => {
      manualToolSwitch.current = false;
    }, 300);
  };

  useEffect(() => {
    // push style updates to EmbedPDF when sliders/colors change
    if (activeTool === 'stamp' && stampImageData) {
      signatureApiRef?.current?.setAnnotationStyle?.('stamp', { imageSrc: stampImageData });
    } else {
      signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
    }
  }, [activeTool, buildToolOptions, signatureApiRef, stampImageData]);

  // Sync preview size from overlay to annotation engine
  useEffect(() => {
    // When preview size changes, update stamp annotation sizing
    // The SignatureAPIBridge will use placementPreviewSize from SignatureContext
    // and apply the converted size to the stamp tool automatically
    if (activeTool === 'stamp' && placementPreviewSize && stampImageData) {
      // Just update the image source; size is handled by SignatureAPIBridge
      signatureApiRef?.current?.setAnnotationStyle?.('stamp', {
        imageSrc: stampImageData,
      });
    }
  }, [placementPreviewSize, activeTool, stampImageData, signatureApiRef]);

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
      // Only update state when selection actually changes
      if (annId !== selectedAnnId) {
        setSelectedAnn(ann || null);
        setSelectedAnnId(annId);
        if (ann?.object?.contents !== undefined) {
          setSelectedTextDraft(ann.object.contents ?? '');
        }
        if (ann?.object?.fontSize !== undefined) {
          setSelectedFontSize(ann.object.fontSize ?? 14);
        }

        // Switch active tool to match annotation type (unless user manually switched tools)
        if (ann?.object?.type !== undefined && !manualToolSwitch.current) {
          let matchingTool: AnnotationToolId | undefined;

          // Special handling for INK type (15) - distinguish between pen and freehand highlighter
          if (ann.object.type === 15) {
            // Freehand highlighter typically has:
            // - Higher opacity (> 0.8) OR
            // - Larger width (> 4)
            const opacity = ann.object.opacity ?? 1;
            const width = ann.object.borderWidth ?? ann.object.strokeWidth ?? ann.object.lineWidth ?? 2;

            if (opacity < 0.8 || width >= 5) {
              matchingTool = 'inkHighlighter';
            } else {
              matchingTool = 'ink';
            }
          } else {
            const typeToToolMap: Record<number, AnnotationToolId> = {
              3: 'text',        // FREETEXT
              4: 'line',        // LINE
              5: 'square',      // SQUARE
              6: 'circle',      // CIRCLE
              7: 'polygon',     // POLYGON
              8: 'polyline',    // POLYLINE
              9: 'highlight',   // HIGHLIGHT
              10: 'underline',  // UNDERLINE
              11: 'squiggly',   // SQUIGGLY
              12: 'strikeout',  // STRIKEOUT
              13: 'stamp',      // STAMP
            };
            matchingTool = typeToToolMap[ann.object.type];
          }

          if (matchingTool && matchingTool !== activeTool) {
            setActiveTool(matchingTool);
          }
        }
      }
    }, 150);
    return () => clearInterval(interval);
  }, [signatureApiRef, selectedAnnId, activeTool]);

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
    { id: 'stamp', label: t('annotation.stamp', 'Add Image'), icon: 'add-photo-alternate' },
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
      <Stack gap="sm">
        {activeTool === 'stamp' ? (
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
                    setStampImageData(dataUrl);

                    // Configure SignatureContext for placement preview
                    setSignatureConfig({
                      signatureType: 'image',
                      signatureData: dataUrl,
                    });

                    setIsAnnotationPaused(false);

                    // Activate placement mode with delay
                    setTimeout(() => {
                      viewerContext?.setAnnotationMode(true);
                      setPlacementMode(true); // This shows the preview overlay
                      signatureApiRef?.current?.setAnnotationStyle?.('stamp', { imageSrc: dataUrl });
                      signatureApiRef?.current?.activateAnnotationTool?.('stamp', { imageSrc: dataUrl });
                    }, 150);
                  } catch (err) {
                    console.error('Failed to load stamp image', err);
                  }
                } else {
                  setStampImageData(undefined);
                  setPlacementMode(false);
                  setSignatureConfig(null);
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
          </>
        )}

        {['square', 'circle', 'line', 'polygon'].includes(activeTool) && (
          <>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
              <Slider min={10} max={100} value={shapeOpacity} onChange={(value) => {
                setShapeOpacity(value);
                setShapeStrokeOpacity(value);
                setShapeFillOpacity(value);
              }} />
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
    );

    const selectedAnnotationControls = selectedAnn && (() => {
      const type = selectedAnn.object?.type;

      // Type 9: Highlight, Type 10: Underline, Type 11: Squiggly, Type 12: Strikeout
      if ([9, 10, 11, 12].includes(type)) {
        return (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{t('annotation.editTextMarkup', 'Edit Text Markup')}</Text>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.color', 'Color')}</Text>
              <ColorSwatchButton
                color={selectedAnn.object?.color ?? highlightColor}
                size={28}
                onClick={() => {
                  setColorPickerTarget('highlight');
                  setIsColorPickerOpen(true);
                }}
              />
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
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
            </Box>
          </Stack>
        );
      }

      // Type 15: Ink (pen)
      if (type === 15) {
        return (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{t('annotation.editInk', 'Edit Pen')}</Text>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.color', 'Color')}</Text>
              <ColorSwatchButton
                color={selectedAnn.object?.color ?? inkColor}
                size={28}
                onClick={() => {
                  setColorPickerTarget('ink');
                  setIsColorPickerOpen(true);
                }}
              />
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Width')}</Text>
              <Slider
                min={1}
                max={12}
                value={selectedAnn.object?.borderWidth ?? inkWidth}
                onChange={(value) => {
                  signatureApiRef?.current?.updateAnnotation?.(
                    selectedAnn.object?.pageIndex ?? 0,
                    selectedAnn.object?.id,
                    {
                      borderWidth: value,
                      strokeWidth: value,
                      lineWidth: value,
                    }
                  );
                  setInkWidth(value);
                }}
              />
            </Box>
          </Stack>
        );
      }

      // Type 3: Text box
      if (type === 3) {
        return (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{t('annotation.editText', 'Edit Text Box')}</Text>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.color', 'Color')}</Text>
              <ColorSwatchButton
                color={selectedAnn.object?.textColor ?? selectedAnn.object?.color ?? textColor}
                size={28}
                onClick={() => {
                  setColorPickerTarget('text');
                  setIsColorPickerOpen(true);
                }}
              />
            </Box>
            <Textarea
              label={t('annotation.text', 'Text')}
              value={selectedTextDraft}
              minRows={3}
              maxRows={8}
              autosize
              onKeyDown={(e) => {
                // Explicitly handle Enter key to insert newlines
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const val = selectedTextDraft;
                  // Use \r\n for PDF compatibility
                  const newVal = val.substring(0, start) + '\r\n' + val.substring(end);
                  setSelectedTextDraft(newVal);
                  // Update cursor position after state update
                  setTimeout(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  }, 0);
                  // Trigger annotation update
                  if (selectedUpdateTimer.current) {
                    clearTimeout(selectedUpdateTimer.current);
                  }
                  selectedUpdateTimer.current = setTimeout(() => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      { contents: newVal, textColor: selectedAnn.object?.textColor ?? textColor }
                    );
                  }, 120);
                }
              }}
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
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.fontSize', 'Font size')}</Text>
              <Slider
                min={8}
                max={32}
                value={selectedFontSize}
                onChange={(size) => {
                  setSelectedFontSize(size);
                  signatureApiRef?.current?.updateAnnotation?.(
                    selectedAnn.object?.pageIndex ?? 0,
                    selectedAnn.object?.id,
                    { fontSize: size }
                  );
                }}
              />
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.textAlignment', 'Text Alignment')}</Text>
              <Group gap="xs">
                <ActionIcon
                  variant={(selectedAnn.object?.textAlign ?? 'left') === 'left' ? 'filled' : 'default'}
                  onClick={() => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      { textAlign: 'left' }
                    );
                  }}
                  size="md"
                >
                  <LocalIcon icon="format-align-left" width={18} height={18} />
                </ActionIcon>
                <ActionIcon
                  variant={(selectedAnn.object?.textAlign ?? 'left') === 'center' ? 'filled' : 'default'}
                  onClick={() => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      { textAlign: 'center' }
                    );
                  }}
                  size="md"
                >
                  <LocalIcon icon="format-align-center" width={18} height={18} />
                </ActionIcon>
                <ActionIcon
                  variant={(selectedAnn.object?.textAlign ?? 'left') === 'right' ? 'filled' : 'default'}
                  onClick={() => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      { textAlign: 'right' }
                    );
                  }}
                  size="md"
                >
                  <LocalIcon icon="format-align-right" width={18} height={18} />
                </ActionIcon>
              </Group>
            </Box>
          </Stack>
        );
      }

      // Type 4: Line
      if (type === 4) {
        return (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{t('annotation.editLine', 'Edit Line')}</Text>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.color', 'Color')}</Text>
              <ColorSwatchButton
                color={selectedAnn.object?.strokeColor ?? shapeStrokeColor}
                size={28}
                onClick={() => {
                  setColorPickerTarget('shapeStroke');
                  setIsColorPickerOpen(true);
                }}
              />
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
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
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Width')}</Text>
              <Slider
                min={1}
                max={12}
                value={selectedAnn.object?.borderWidth ?? shapeThickness}
                onChange={(value) => {
                  signatureApiRef?.current?.updateAnnotation?.(
                    selectedAnn.object?.pageIndex ?? 0,
                    selectedAnn.object?.id,
                    {
                      borderWidth: value,
                      strokeWidth: value,
                      lineWidth: value,
                    }
                  );
                  setShapeThickness(value);
                }}
              />
            </Box>
          </Stack>
        );
      }

      // Type 5: Square, Type 6: Circle, Type 7: Polygon
      if ([5, 6, 7].includes(type)) {
        const shapeName = type === 5 ? 'Square' : type === 6 ? 'Circle' : 'Polygon';
        return (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{t(`annotation.edit${shapeName}`, `Edit ${shapeName}`)}</Text>
            <Group gap="md">
              <Stack gap={4} align="center">
                <Text size="xs" c="dimmed">{t('annotation.strokeColor', 'Stroke Color')}</Text>
                <ColorSwatchButton
                  color={selectedAnn.object?.strokeColor ?? shapeStrokeColor}
                  size={28}
                  onClick={() => {
                    setColorPickerTarget('shapeStroke');
                    setIsColorPickerOpen(true);
                  }}
                />
              </Stack>
              <Stack gap={4} align="center">
                <Text size="xs" c="dimmed">{t('annotation.fillColor', 'Fill Color')}</Text>
                <ColorSwatchButton
                  color={selectedAnn.object?.color ?? shapeFillColor}
                  size={28}
                  onClick={() => {
                    setColorPickerTarget('shapeFill');
                    setIsColorPickerOpen(true);
                  }}
                />
              </Stack>
            </Group>
            <Box>
              <Text size="xs" c="dimmed" mb={4}>{t('annotation.opacity', 'Opacity')}</Text>
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
            </Box>
            <Group gap="xs" align="flex-end">
              <Box style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" mb={4}>{t('annotation.strokeWidth', 'Stroke')}</Text>
                <Slider
                  min={0}
                  max={12}
                  value={selectedAnn.object?.borderWidth ?? shapeThickness}
                  onChange={(value) => {
                    signatureApiRef?.current?.updateAnnotation?.(
                      selectedAnn.object?.pageIndex ?? 0,
                      selectedAnn.object?.id,
                      {
                        borderWidth: value,
                        strokeWidth: value,
                        lineWidth: value,
                      }
                    );
                    setShapeThickness(value);
                  }}
                />
              </Box>
              <Button
                size="xs"
                variant={(selectedAnn.object?.borderWidth ?? shapeThickness) === 0 ? 'filled' : 'light'}
                onClick={() => {
                  const newValue = (selectedAnn.object?.borderWidth ?? shapeThickness) === 0 ? 1 : 0;
                  signatureApiRef?.current?.updateAnnotation?.(
                    selectedAnn.object?.pageIndex ?? 0,
                    selectedAnn.object?.id,
                    {
                      borderWidth: newValue,
                      strokeWidth: newValue,
                      lineWidth: newValue,
                    }
                  );
                  setShapeThickness(newValue);
                }}
              >
                {(selectedAnn.object?.borderWidth ?? shapeThickness) === 0
                  ? t('annotation.borderOff', 'Border: Off')
                  : t('annotation.borderOn', 'Border: On')
                }
              </Button>
            </Group>
          </Stack>
        );
      }

      // Default fallback
      return (
        <Stack gap="sm">
          <Text size="sm" fw={600}>{t('annotation.editSelected', 'Edit Annotation')}</Text>
          <Text size="xs" c="dimmed">{t('annotation.unsupportedType', 'This annotation type is not fully supported for editing.')}</Text>
        </Stack>
      );
    })();

    const saveAndColorPicker = (
      <>
        <Button
          fullWidth
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
          showOpacity={colorPickerTarget !== 'text' && colorPickerTarget !== 'shapeStroke' && colorPickerTarget !== 'shapeFill' && colorPickerTarget !== null}
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
                signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              }
              if (selectedAnn?.object?.id && (selectedAnn.object?.type === 9 || selectedAnn.object?.type === 15)) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
              }
            } else if (colorPickerTarget === 'underline') {
              setUnderlineOpacity(opacity);
              signatureApiRef?.current?.setAnnotationStyle?.('underline', buildToolOptions('underline'));
              if (selectedAnn?.object?.id && selectedAnn.object?.type === 10) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
              }
            } else if (colorPickerTarget === 'strikeout') {
              setStrikeoutOpacity(opacity);
              signatureApiRef?.current?.setAnnotationStyle?.('strikeout', buildToolOptions('strikeout'));
              if (selectedAnn?.object?.id && selectedAnn.object?.type === 12) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
              }
            } else if (colorPickerTarget === 'squiggly') {
              setSquigglyOpacity(opacity);
              signatureApiRef?.current?.setAnnotationStyle?.('squiggly', buildToolOptions('squiggly'));
              if (selectedAnn?.object?.id && selectedAnn.object?.type === 11) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, { opacity: opacity / 100 });
              }
            } else if (colorPickerTarget === 'shapeStroke') {
              setShapeStrokeOpacity(opacity);
              const shapeTools = ['square', 'circle', 'polygon'] as AnnotationToolId[];
              if (shapeTools.includes(activeTool)) {
                signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              }
            } else if (colorPickerTarget === 'shapeFill') {
              setShapeFillOpacity(opacity);
              const fillShapeTools = ['square', 'circle', 'polygon'] as AnnotationToolId[];
              if (fillShapeTools.includes(activeTool)) {
                signatureApiRef?.current?.setAnnotationStyle?.(activeTool, buildToolOptions(activeTool));
              }
            }
          }}
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
            const shapeTools = ['square', 'circle', 'line', 'lineArrow', 'polyline', 'polygon'] as AnnotationToolId[];
            const fillShapeTools = ['square', 'circle', 'polygon'] as AnnotationToolId[];

            if (colorPickerTarget === 'shapeStroke') {
              setShapeStrokeColor(color);
              const styleTool = shapeTools.includes(activeTool) ? activeTool : null;
              if (styleTool) {
                signatureApiRef?.current?.setAnnotationStyle?.(styleTool, buildToolOptions(styleTool));
              }
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
                  strokeColor: color, // border color
                  color: selectedAnn.object?.color ?? shapeFillColor, // preserve fill
                  borderWidth: shapeThickness,
                });
              }
            }
            if (colorPickerTarget === 'shapeFill') {
              setShapeFillColor(color);
              const styleTool = fillShapeTools.includes(activeTool) ? activeTool : null;
              if (styleTool) {
                signatureApiRef?.current?.setAnnotationStyle?.(styleTool, buildToolOptions(styleTool));
              }
              if (selectedAnn?.object?.id) {
                signatureApiRef?.current?.updateAnnotation?.(selectedAnn.object.pageIndex ?? 0, selectedAnn.object.id, {
                  color, // fill color
                  strokeColor: selectedAnn.object?.strokeColor ?? shapeStrokeColor, // preserve border
                  borderWidth: shapeThickness,
                });
              }
            }
          }}
          title={t('annotation.chooseColor', 'Choose color')}
        />
      </>
    );

    return [
      {
        title: t('annotation.title', 'Annotate'),
        isCollapsed: false,
        onCollapsedClick: undefined,
        content: (
          <Stack gap="md">
            {/* Annotation Controls */}
            <Group gap="xs" wrap="nowrap">
              {isAnnotationPaused ? (
                <Tooltip label={t('annotation.resumeTooltip', 'Resume placement')}>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    onClick={() => {
                      viewerContext?.setAnnotationMode(true);
                      signatureApiRef?.current?.activateAnnotationTool?.(activeTool, buildToolOptions(activeTool));
                      setIsAnnotationPaused(false);
                    }}
                    style={{
                      width: 'auto',
                      paddingInline: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <LocalIcon icon="material-symbols:play-arrow-rounded" width={20} height={20} />
                    <Text component="span" size="sm" fw={500}>
                      {t('annotation.resume', 'Resume placement')}
                    </Text>
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label={t('annotation.pauseTooltip', 'Pause placement')}>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    onClick={() => {
                      signatureApiRef?.current?.deactivateTools();
                      setIsAnnotationPaused(true);
                    }}
                    style={{
                      width: 'auto',
                      paddingInline: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <LocalIcon icon="material-symbols:pause-rounded" width={20} height={20} />
                    <Text component="span" size="sm" fw={500}>
                      {t('annotation.pause', 'Pause placement')}
                    </Text>
                  </ActionIcon>
                </Tooltip>
              )}

              <Tooltip label={t('annotation.undo', 'Undo')}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  onClick={undo}
                  disabled={!historyAvailability.canUndo}
                >
                  <LocalIcon icon="undo" width={20} height={20} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label={t('annotation.redo', 'Redo')}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  onClick={redo}
                  disabled={!historyAvailability.canRedo}
                >
                  <LocalIcon icon="redo" width={20} height={20} />
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Text Markup Tools */}
            <Box>
              <Text size="sm" fw={600} mb="xs">{t('annotation.textMarkup', 'Text Markup')}</Text>
              {renderToolButtons(textMarkupTools)}
            </Box>

            {/* Drawing Tools */}
            <Box>
              <Text size="sm" fw={600} mb="xs">{t('annotation.drawing', 'Drawing')}</Text>
              {renderToolButtons(drawingTools)}
            </Box>

            {/* Shape Tools */}
            <Box>
              <Text size="sm" fw={600} mb="xs">{t('annotation.shapes', 'Shapes')}</Text>
              {renderToolButtons(shapeTools)}
            </Box>

            {/* Other Tools */}
            <Box>
              <Text size="sm" fw={600} mb="xs">{t('annotation.notesStamps', 'Notes & Stamps')}</Text>
              {renderToolButtons(otherTools)}
            </Box>

            {/* Settings */}
            {!selectedAnn && defaultStyleControls}

            {/* Edit Selected */}
            {selectedAnn && selectedAnnotationControls}

            {/* Save Button */}
            {saveAndColorPicker}
          </Stack>
        ),
      },
    ];
  }, [
    activeTool,
    textMarkupTools,
    drawingTools,
    shapeTools,
    otherTools,
    highlightColor,
    highlightOpacity,
    underlineColor,
    underlineOpacity,
    strikeoutColor,
    strikeoutOpacity,
    squigglyColor,
    squigglyOpacity,
    inkColor,
    inkWidth,
    shapeStrokeColor,
    shapeFillColor,
    shapeStrokeOpacity,
    shapeFillOpacity,
    shapeThickness,
    selectedFiles.length,
    t,
    selectedAnn,
    textColor,
    textSize,
    viewerContext?.exportActions,
    selectors,
    signatureApiRef,
    setActiveTool,
    isColorPickerOpen,
    colorPickerTarget,
    activeColor,
    buildToolOptions,
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
