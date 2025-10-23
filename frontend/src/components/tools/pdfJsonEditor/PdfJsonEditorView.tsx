import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  FileButton,
  Group,
  Pagination,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import UploadIcon from '@mui/icons-material/Upload';
import { Rnd } from 'react-rnd';

import {
  PdfJsonEditorViewData,
  PdfJsonPage,
} from '../../../tools/pdfJsonEditorTypes';
import { getImageBounds, pageDimensions } from '../../../tools/pdfJsonEditorUtils';

const MAX_RENDER_WIDTH = 820;
const MIN_BOX_SIZE = 18;

const getCaretOffset = (element: HTMLElement): number => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !element.contains(selection.focusNode)) {
    return element.innerText.length;
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.focusNode as Node, selection.focusOffset);
  return range.toString().length;
};

const setCaretOffset = (element: HTMLElement, offset: number): void => {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const targetOffset = Math.max(0, Math.min(offset, element.innerText.length));
  const range = document.createRange();
  let remaining = targetOffset;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const length = textNode.length;
    if (remaining <= length) {
      range.setStart(textNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

interface PdfJsonEditorViewProps {
  data: PdfJsonEditorViewData;
}

const toCssBounds = (
  _page: PdfJsonPage | null | undefined,
  pageHeight: number,
  scale: number,
  bounds: { left: number; right: number; top: number; bottom: number },
) => {
  const width = Math.max(bounds.right - bounds.left, 1);
  const height = Math.max(bounds.bottom - bounds.top, 1);
  // Add 20% buffer to width to account for padding and font rendering variations
  const bufferedWidth = width * 1.2;
  const scaledWidth = Math.max(bufferedWidth * scale, MIN_BOX_SIZE);
  const scaledHeight = Math.max(height * scale, MIN_BOX_SIZE / 2);
  const top = Math.max(pageHeight - bounds.bottom, 0) * scale;

  return {
    left: bounds.left * scale,
    top,
    width: scaledWidth,
    height: scaledHeight,
  };
};

const PdfJsonEditorView = ({ data }: PdfJsonEditorViewProps) => {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const caretOffsetsRef = useRef<Map<string, number>>(new Map());

  const {
    document: pdfDocument,
    groupsByPage,
    imagesByPage,
    selectedPage,
    dirtyPages,
    hasDocument,
    fileName,
    errorMessage,
    isGeneratingPdf,
    isConverting,
    hasChanges,
    onLoadJson,
    onSelectPage,
    onGroupEdit,
    onImageTransform,
    onImageReset,
    onReset,
    onDownloadJson,
    onGeneratePdf,
  } = data;

  const getFontFamily = (fontId: string | null | undefined): string => {
    if (!fontId || !pdfDocument?.fonts) {
      return 'sans-serif';
    }
    const font = pdfDocument.fonts.find((f) => f.id === fontId);
    if (!font) {
      return 'sans-serif';
    }

    // Map PDF fonts to web-safe fonts based on name
    // Note: Embedded font data from PDFs often lacks tables required for web rendering (OS/2 table)
    const fontName = font.standard14Name || font.baseName || '';
    const lowerName = fontName.toLowerCase();

    if (lowerName.includes('times')) {
      return '"Times New Roman", Times, serif';
    }
    if (lowerName.includes('helvetica') || lowerName.includes('arial')) {
      return 'Arial, Helvetica, sans-serif';
    }
    if (lowerName.includes('courier')) {
      return '"Courier New", Courier, monospace';
    }
    if (lowerName.includes('symbol')) {
      return 'Symbol, serif';
    }

    return 'Arial, Helvetica, sans-serif';
  };

  const pages = pdfDocument?.pages ?? [];
  const currentPage = pages[selectedPage] ?? null;
  const pageGroups = groupsByPage[selectedPage] ?? [];
  const pageImages = imagesByPage[selectedPage] ?? [];
  const visibleGroups = useMemo(
    () =>
      pageGroups.filter((group) => {
        const hasContent = ((group.text ?? '').trim().length > 0) || ((group.originalText ?? '').trim().length > 0);
        return hasContent || editingGroupId === group.id;
      }),
    [editingGroupId, pageGroups]
  );

  const orderedImages = useMemo(
    () =>
      [...pageImages].sort(
        (first, second) => (first?.zOrder ?? -1_000_000) - (second?.zOrder ?? -1_000_000),
      ),
    [pageImages],
  );

  const { width: pageWidth, height: pageHeight } = pageDimensions(currentPage);
  const scale = useMemo(() => Math.min(MAX_RENDER_WIDTH / pageWidth, 1.5), [pageWidth]);
  const scaledWidth = pageWidth * scale;
  const scaledHeight = pageHeight * scale;

  useEffect(() => {
    setActiveGroupId(null);
    setEditingGroupId(null);
    setActiveImageId(null);
  }, [selectedPage]);

  useLayoutEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const editor = editorRefs.current.get(editingGroupId);
    if (!editor) {
      return;
    }
    const offset = caretOffsetsRef.current.get(editingGroupId) ?? editor.innerText.length;
    setCaretOffset(editor, offset);
  }, [editingGroupId, groupsByPage, imagesByPage]);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const editor = document.querySelector<HTMLElement>(`[data-editor-group="${editingGroupId}"]`);
    if (editor) {
      editor.focus();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.addRange(range);
      }
    }
  }, [editingGroupId]);

  const handlePageChange = (pageNumber: number) => {
    setActiveGroupId(null);
    setEditingGroupId(null);
    onSelectPage(pageNumber - 1);
  };

  const handleBackgroundClick = () => {
    setEditingGroupId(null);
    setActiveGroupId(null);
    setActiveImageId(null);
  };

  const renderGroupContainer = (
    groupId: string,
    isActive: boolean,
    isChanged: boolean,
    content: React.ReactNode,
    onActivate?: (event: React.MouseEvent) => void,
  ) => (
    <Box
      component="div"
      style={{
        width: '100%',
        height: '100%',
        outline: isActive
          ? '2px solid var(--mantine-color-blue-5)'
          : isChanged
            ? '1px solid var(--mantine-color-yellow-5)'
            : 'none',
        outlineOffset: '-1px',
        borderRadius: 6,
        backgroundColor: isChanged || isActive ? 'rgba(250,255,189,0.28)' : 'transparent',
        transition: 'outline 120ms ease, background-color 120ms ease',
        pointerEvents: 'auto',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 0,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onActivate?.(event);
      }}
      onMouseEnter={() => setActiveGroupId(groupId)}
      onMouseLeave={() => {
        if (editingGroupId !== groupId) {
          setActiveGroupId((current) => (current === groupId ? null : current));
        }
      }}
    >
      {content}
    </Box>
  );

  const emitImageTransform = useCallback(
    (
      imageId: string,
      leftPx: number,
      topPx: number,
      widthPx: number,
      heightPx: number,
    ) => {
      const rawLeft = leftPx / scale;
      const rawTop = pageHeight - topPx / scale;
      const width = Math.max(widthPx / scale, 0.01);
      const height = Math.max(heightPx / scale, 0.01);
      const maxLeft = Math.max(pageWidth - width, 0);
      const left = Math.min(Math.max(rawLeft, 0), maxLeft);
      const minTop = Math.min(height, pageHeight);
      const top = Math.min(Math.max(rawTop, minTop), pageHeight);
      const bottom = Math.max(top - height, 0);
      onImageTransform(selectedPage, imageId, { left, bottom, width, height, transform: [] });
    },
    [onImageTransform, pageHeight, pageWidth, scale, selectedPage],
  );

  return (
    <Stack gap="xl" className="h-full" style={{ padding: '1.5rem', overflow: 'auto' }}>
      <Card withBorder radius="md" shadow="xs" padding="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs" align="center">
              <DescriptionIcon fontSize="small" />
              <Title order={3}>{t('pdfJsonEditor.title', 'PDF JSON Editor')}</Title>
              {hasChanges && <Badge color="yellow" size="sm">{t('pdfJsonEditor.badges.unsaved', 'Edited')}</Badge>}
            </Group>
            <Group gap="sm">
              <FileButton onChange={onLoadJson} accept="application/pdf,application/json,.pdf,.json">
                {(props) => (
                  <Button
                    variant="light"
                    leftSection={<UploadIcon fontSize="small" />}
                    loading={isConverting}
                    {...props}
                  >
                    {t('pdfJsonEditor.actions.load', 'Load File')}
                  </Button>
                )}
              </FileButton>
              <Button
                variant="subtle"
                leftSection={<AutorenewIcon fontSize="small" />}
                onClick={onReset}
                disabled={!hasDocument || isConverting}
              >
                {t('pdfJsonEditor.actions.reset', 'Reset Changes')}
              </Button>
              <Button
                variant="default"
                leftSection={<FileDownloadIcon fontSize="small" />}
                onClick={onDownloadJson}
                disabled={!hasDocument || isConverting}
              >
                {t('pdfJsonEditor.actions.downloadJson', 'Download JSON')}
              </Button>
              <Button
                leftSection={<PictureAsPdfIcon fontSize="small" />}
                onClick={onGeneratePdf}
                loading={isGeneratingPdf}
                disabled={!hasDocument || !hasChanges || isConverting}
              >
                {t('pdfJsonEditor.actions.generatePdf', 'Generate PDF')}
              </Button>
            </Group>
          </Group>

          {fileName && (
            <Text size="sm" c="dimmed">
              {t('pdfJsonEditor.currentFile', 'Current file: {{name}}', { name: fileName })}
            </Text>
          )}
        </Stack>
      </Card>

      {errorMessage && (
        <Alert icon={<WarningAmberIcon fontSize="small" />} color="red" radius="md">
          {errorMessage}
        </Alert>
      )}

      {!hasDocument && !isConverting && (
        <Card withBorder radius="md" padding="xl">
          <Stack align="center" gap="md">
            <DescriptionIcon sx={{ fontSize: 48 }} />
            <Text size="lg" fw={600}>
              {t('pdfJsonEditor.empty.title', 'No document loaded')}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              {t('pdfJsonEditor.empty.subtitle', 'Load a PDF or JSON file to begin editing text content.')}
            </Text>
          </Stack>
        </Card>
      )}

      {isConverting && (
        <Card withBorder radius="md" padding="xl">
          <Stack align="center" gap="md">
            <AutorenewIcon sx={{ fontSize: 48 }} className="animate-spin" />
            <Text size="lg" fw={600}>
              {t('pdfJsonEditor.converting', 'Converting PDF to editable format...')}
            </Text>
          </Stack>
        </Card>
      )}

      {hasDocument && (
        <Stack gap="lg" className="flex-1" style={{ minHeight: 0 }}>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Text fw={500}>
                {t('pdfJsonEditor.pageSummary', 'Page {{number}} of {{total}}', {
                  number: selectedPage + 1,
                  total: pages.length,
                })}
              </Text>
              {dirtyPages[selectedPage] && (
                <Badge color="yellow" size="xs">
                  {t('pdfJsonEditor.badges.modified', 'Edited')}
                </Badge>
              )}
            </Group>
            {pages.length > 1 && (
              <Pagination
                value={selectedPage + 1}
                onChange={handlePageChange}
                total={pages.length}
                size="sm"
              />
            )}
          </Group>

          <Card withBorder padding="md" radius="md" shadow="xs" style={{ flex: 1, minHeight: 0 }}>
            <ScrollArea h="100%" offsetScrollbars>
              <Box
                style={{
                  margin: '0 auto',
                  background: '#f3f4f6',
                  padding: '1.5rem',
                  borderRadius: '0.75rem',
                }}
                onClick={handleBackgroundClick}
              >
                <Box
                  style={{
                    position: 'relative',
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 12px rgba(15, 23, 42, 0.12)',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                  }}
                  ref={containerRef}
                >
                  {orderedImages.map((image, imageIndex) => {
                    if (!image?.imageData) {
                      return null;
                    }
                    const bounds = getImageBounds(image);
                    const width = Math.max(bounds.right - bounds.left, 1);
                    const height = Math.max(bounds.top - bounds.bottom, 1);
                    const cssWidth = Math.max(width * scale, 2);
                    const cssHeight = Math.max(height * scale, 2);
                    const cssLeft = bounds.left * scale;
                    const cssTop = (pageHeight - bounds.top) * scale;
                    const imageId = image.id ?? `page-${selectedPage}-image-${imageIndex}`;
                    const isActive = activeImageId === imageId;
                    const src = `data:image/${image.imageFormat ?? 'png'};base64,${image.imageData}`;
                    const baseZIndex = (image.zOrder ?? -1_000_000) + 1_050_000;
                    const zIndex = isActive ? baseZIndex + 1_000_000 : baseZIndex;

                    return (
                      <Rnd
                        key={`image-${imageId}`}
                        bounds="parent"
                        size={{ width: cssWidth, height: cssHeight }}
                        position={{ x: cssLeft, y: cssTop }}
                        onDragStart={() => {
                          setActiveGroupId(null);
                          setEditingGroupId(null);
                          setActiveImageId(imageId);
                        }}
                        onDrag={(event, data) => {
                          emitImageTransform(
                            imageId,
                            data.x,
                            data.y,
                            cssWidth,
                            cssHeight,
                          );
                        }}
                        onDragStop={(event, data) => {
                          emitImageTransform(
                            imageId,
                            data.x,
                            data.y,
                            cssWidth,
                            cssHeight,
                          );
                        }}
                        onResizeStart={() => {
                          setActiveImageId(imageId);
                          setActiveGroupId(null);
                          setEditingGroupId(null);
                        }}
                        onResize={(event, _direction, ref, _delta, position) => {
                          const nextWidth = parseFloat(ref.style.width);
                          const nextHeight = parseFloat(ref.style.height);
                          emitImageTransform(
                            imageId,
                            position.x,
                            position.y,
                            nextWidth,
                            nextHeight,
                          );
                        }}
                        onResizeStop={(event, _direction, ref, _delta, position) => {
                          const nextWidth = parseFloat(ref.style.width);
                          const nextHeight = parseFloat(ref.style.height);
                          emitImageTransform(
                            imageId,
                            position.x,
                            position.y,
                            nextWidth,
                            nextHeight,
                          );
                        }}
                        style={{ zIndex }}
                      >
                        <Box
                          onMouseEnter={() => setActiveImageId(imageId)}
                          onMouseLeave={() => {
                            setActiveImageId((current) => (current === imageId ? null : current));
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            onImageReset(selectedPage, imageId);
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            cursor: isActive ? 'grabbing' : 'grab',
                            outline: isActive
                              ? '2px solid rgba(59, 130, 246, 0.9)'
                              : '1px solid rgba(148, 163, 184, 0.4)',
                            outlineOffset: '-1px',
                            borderRadius: 4,
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            transition: 'outline 120ms ease',
                          }}
                        >
                          <img
                            src={src}
                            alt={t('pdfJsonEditor.imageLabel', 'Placed image')}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              pointerEvents: 'none',
                              userSelect: 'none',
                            }}
                          />
                        </Box>
                      </Rnd>
                    );
                  })}
                  {visibleGroups.length === 0 && orderedImages.length === 0 ? (
                    <Group justify="center" align="center" style={{ height: '100%' }}>
                      <Stack gap={4} align="center">
                        <Text size="sm" c="dimmed">
                          {t('pdfJsonEditor.noTextOnPage', 'No editable text was detected on this page.')}
                        </Text>
                      </Stack>
                    </Group>
                  ) : (
                    visibleGroups.map((group) => {
                      const bounds = toCssBounds(currentPage, pageHeight, scale, group.bounds);
                      const changed = group.text !== group.originalText;
                      const isActive = activeGroupId === group.id || editingGroupId === group.id;
                      const isEditing = editingGroupId === group.id;
                      const baseFontSize = group.fontMatrixSize ?? group.fontSize ?? 12;
                      const fontSizePx = Math.max(baseFontSize * scale, 6);
                      const fontFamily = getFontFamily(group.fontId);

                      const visualHeight = Math.max(bounds.height, fontSizePx * 1.2);

                      const containerStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: `${bounds.left}px`,
                        top: `${bounds.top}px`,
                        width: `${bounds.width}px`,
                        height: `${visualHeight}px`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        pointerEvents: 'auto',
                        cursor: 'text',
                        zIndex: 2_000_000,
                      };

                      if (isEditing) {
                        return (
                          <Box key={group.id} style={containerStyle}>
                            {renderGroupContainer(
                              group.id,
                              true,
                              changed,
                              <div
                                ref={(node) => {
                                  if (node) {
                                    editorRefs.current.set(group.id, node);
                                  } else {
                                    editorRefs.current.delete(group.id);
                                  }
                                }}
                                contentEditable
                                suppressContentEditableWarning
                                data-editor-group={group.id}
                                onBlur={(event) => {
                                  const value = event.currentTarget.innerText.replace(/\u00A0/g, ' ');
                                  caretOffsetsRef.current.delete(group.id);
                                  editorRefs.current.delete(group.id);
                                  setActiveGroupId(null);
                                  onGroupEdit(group.pageIndex, group.id, value);
                                  setEditingGroupId(null);
                                }}
                                onInput={(event) => {
                                  const value = event.currentTarget.innerText.replace(/\u00A0/g, ' ');
                                  const offset = getCaretOffset(event.currentTarget);
                                  caretOffsetsRef.current.set(group.id, offset);
                                  onGroupEdit(group.pageIndex, group.id, value);
                                  requestAnimationFrame(() => {
                                    if (editingGroupId !== group.id) {
                                      return;
                                    }
                                    const editor = editorRefs.current.get(group.id);
                                    if (editor) {
                                      setCaretOffset(editor, caretOffsetsRef.current.get(group.id) ?? editor.innerText.length);
                                    }
                                  });
                                }}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  padding: '3px 4px',
                                  backgroundColor: 'rgba(255,255,255,0.95)',
                                  color: '#111827',
                                  fontSize: `${fontSizePx}px`,
                                  fontFamily,
                                  lineHeight: 1.25,
                                  outline: 'none',
                                  border: 'none',
                                  display: 'block',
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                  cursor: 'text',
                                  overflow: 'visible',
                                }}
                              >
                                {group.text || '\u00A0'}
                              </div>,
                            )}
                          </Box>
                        );
                      }

                      return (
                        <Box key={group.id} style={containerStyle}>
                          {renderGroupContainer(
                            group.id,
                            isActive,
                            changed,
                            <div
                              style={{
                                width: '100%',
                                minHeight: '100%',
                                padding: '2px 4px',
                                whiteSpace: 'pre-wrap',
                                fontSize: `${fontSizePx}px`,
                                fontFamily,
                                lineHeight: 1.25,
                                color: '#111827',
                                display: 'block',
                                cursor: 'text',
                                overflow: 'visible',
                              }}
                            >
                              <span style={{ pointerEvents: 'none' }}>{group.text || '\u00A0'}</span>
                            </div>,
                            () => {
                              setEditingGroupId(group.id);
                              setActiveGroupId(group.id);
                            },
                          )}
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Box>
            </ScrollArea>
          </Card>

          <Card padding="md" withBorder radius="md">
            <Stack gap="xs">
              <Text fw={500}>{t('pdfJsonEditor.groupList', 'Detected Text Groups')}</Text>
              <Divider />
              <ScrollArea h={180} offsetScrollbars>
                <Stack gap="sm">
                  {visibleGroups.map((group) => {
                    const changed = group.text !== group.originalText;
                    return (
                      <Card
                        key={`list-${group.id}`}
                        padding="sm"
                        radius="md"
                        withBorder
                        shadow={changed ? 'sm' : 'none'}
                        onMouseEnter={() => setActiveGroupId(group.id)}
                        onMouseLeave={() => setActiveGroupId((current) => (current === group.id ? null : current))}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setActiveGroupId(group.id);
                          setEditingGroupId(group.id);
                        }}
                      >
                        <Stack gap={4}>
                          <Group gap="xs">
                            {changed && <Badge color="yellow" size="xs">{t('pdfJsonEditor.badges.modified', 'Edited')}</Badge>}
                            {group.fontId && (
                              <Badge size="xs" variant="outline">{group.fontId}</Badge>
                            )}
                            {group.fontSize && (
                              <Badge size="xs" variant="light">
                                {t('pdfJsonEditor.fontSizeValue', '{{size}}pt', { size: group.fontSize.toFixed(1) })}
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {group.text || t('pdfJsonEditor.emptyGroup', '[Empty Group]')}
                          </Text>
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  );
};

export default PdfJsonEditorView;
