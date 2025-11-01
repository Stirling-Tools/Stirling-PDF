import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Rnd } from 'react-rnd';

import {
  PdfJsonEditorViewData,
  PdfJsonFont,
  PdfJsonPage,
} from '../../../tools/pdfJsonEditorTypes';
import { getImageBounds, pageDimensions } from '../../../tools/pdfJsonEditorUtils';

const MAX_RENDER_WIDTH = 820;
const MIN_BOX_SIZE = 18;

const normalizeFontFormat = (format?: string | null): string => {
  if (!format) {
    return 'ttf';
  }
  const lower = format.toLowerCase();
  if (lower.includes('woff2')) {
    return 'woff2';
  }
  if (lower.includes('woff')) {
    return 'woff';
  }
  if (lower.includes('otf')) {
    return 'otf';
  }
  if (lower.includes('cff')) {
    return 'otf';
  }
  return 'ttf';
};

const getFontMimeType = (format: string): string => {
  switch (format) {
    case 'woff2':
      return 'font/woff2';
    case 'woff':
      return 'font/woff';
    case 'otf':
      return 'font/otf';
    default:
      return 'font/ttf';
  }
};

const getFontFormatHint = (format: string): string | null => {
  switch (format) {
    case 'woff2':
      return 'woff2';
    case 'woff':
      return 'woff';
    case 'otf':
      return 'opentype';
    case 'ttf':
      return 'truetype';
    default:
      return null;
  }
};

const decodeBase64ToUint8Array = (value: string): Uint8Array => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const buildFontFamilyName = (font: PdfJsonFont): string => {
  const preferred = (font.baseName ?? '').trim();
  const identifier = preferred.length > 0 ? preferred : (font.uid ?? font.id ?? 'font').toString();
  return `pdf-font-${identifier.replace(/[^a-zA-Z0-9_-]/g, '')}`;
};

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
  // Note: This codebase uses inverted naming where bounds.bottom > bounds.top
  // bounds.bottom = visually upper edge (larger Y in PDF coords)
  // bounds.top = visually lower edge (smaller Y in PDF coords)
  const height = Math.max(bounds.bottom - bounds.top, 1);
  const scaledWidth = Math.max(width * scale, MIN_BOX_SIZE);
  const scaledHeight = Math.max(height * scale, MIN_BOX_SIZE / 2);
  // Convert PDF's visually upper edge (bounds.bottom) to CSS top
  const top = Math.max(pageHeight - bounds.bottom, 0) * scale;

  return {
    left: bounds.left * scale,
    top,
    width: scaledWidth,
    height: scaledHeight,
  };
};

const normalizePageNumber = (pageIndex: number | null | undefined): number | null => {
  if (pageIndex === null || pageIndex === undefined || Number.isNaN(pageIndex)) {
    return null;
  }
  return pageIndex + 1;
};

const buildFontLookupKeys = (
  fontId: string,
  font: PdfJsonFont | null | undefined,
  pageIndex: number | null | undefined,
): string[] => {
  const keys: string[] = [];
  const pageNumber = normalizePageNumber(pageIndex);
  if (pageNumber !== null) {
    keys.push(`${pageNumber}:${fontId}`);
  }
  if (font?.uid) {
    keys.push(font.uid);
  }
  if (font?.pageNumber !== null && font?.pageNumber !== undefined && font?.id) {
    keys.push(`${font.pageNumber}:${font.id}`);
  }
  keys.push(fontId);
  return Array.from(new Set(keys.filter((value) => value && value.length > 0)));
};

const PdfJsonEditorView = ({ data }: PdfJsonEditorViewProps) => {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [fontFamilies, setFontFamilies] = useState<Map<string, string>>(new Map());
  const [textGroupsExpanded, setTextGroupsExpanded] = useState(false);
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

  const resolveFont = (fontId: string | null | undefined, pageIndex: number | null | undefined): PdfJsonFont | null => {
    if (!fontId || !pdfDocument?.fonts) {
      return null;
    }
    const fonts = pdfDocument.fonts;
    const pageNumber = normalizePageNumber(pageIndex);
    if (pageNumber !== null) {
      const pageMatch = fonts.find((font) => font?.id === fontId && font?.pageNumber === pageNumber);
      if (pageMatch) {
        return pageMatch;
      }
      const uidKey = `${pageNumber}:${fontId}`;
      const uidMatch = fonts.find((font) => font?.uid === uidKey);
      if (uidMatch) {
        return uidMatch;
      }
    }
    const directUid = fonts.find((font) => font?.uid === fontId);
    if (directUid) {
      return directUid;
    }
    return fonts.find((font) => font?.id === fontId) ?? null;
  };

  const getFontFamily = (fontId: string | null | undefined, pageIndex: number | null | undefined): string => {
    if (!fontId) {
      return 'sans-serif';
    }

    const font = resolveFont(fontId, pageIndex);
    const lookupKeys = buildFontLookupKeys(fontId, font ?? undefined, pageIndex);
    for (const key of lookupKeys) {
      const loadedFamily = fontFamilies.get(key);
      if (loadedFamily) {
        return `'${loadedFamily}', sans-serif`;
      }
    }

    const fontName = font?.standard14Name || font?.baseName || '';
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

  const getFontMetricsFor = (
    fontId: string | null | undefined,
    pageIndex: number | null | undefined,
  ): { unitsPerEm: number; ascent: number; descent: number } | undefined => {
    if (!fontId) {
      return undefined;
    }
    const font = resolveFont(fontId, pageIndex);
    const lookupKeys = buildFontLookupKeys(fontId, font ?? undefined, pageIndex);
    for (const key of lookupKeys) {
      const metrics = fontMetrics.get(key);
      if (metrics) {
        return metrics;
      }
    }
    return undefined;
  };

  const getLineHeightPx = (
    fontId: string | null | undefined,
    pageIndex: number | null | undefined,
    fontSizePx: number,
  ): number => {
    if (fontSizePx <= 0) {
      return fontSizePx;
    }
    const metrics = getFontMetricsFor(fontId, pageIndex);
    if (!metrics || metrics.unitsPerEm <= 0) {
      return fontSizePx * 1.2;
    }
    const unitsPerEm = metrics.unitsPerEm > 0 ? metrics.unitsPerEm : 1000;
    const ascentUnits = metrics.ascent ?? unitsPerEm;
    const descentUnits = Math.abs(metrics.descent ?? -(unitsPerEm * 0.2));
    const totalUnits = Math.max(unitsPerEm, ascentUnits + descentUnits);
    if (totalUnits <= 0) {
      return fontSizePx * 1.2;
    }
    const lineHeight = (totalUnits / unitsPerEm) * fontSizePx;
    return Math.max(lineHeight, fontSizePx * 1.05);
  };

  const getFontGeometry = (
    fontId: string | null | undefined,
    pageIndex: number | null | undefined,
  ): {
    unitsPerEm: number;
    ascentUnits: number;
    descentUnits: number;
    totalUnits: number;
    ascentRatio: number;
    descentRatio: number;
  } | undefined => {
    const metrics = getFontMetricsFor(fontId, pageIndex);
    if (!metrics) {
      return undefined;
    }
    const unitsPerEm = metrics.unitsPerEm > 0 ? metrics.unitsPerEm : 1000;
    const rawAscent = metrics.ascent ?? unitsPerEm;
    const rawDescent = metrics.descent ?? -(unitsPerEm * 0.2);
    const ascentUnits = Number.isFinite(rawAscent) ? rawAscent : unitsPerEm;
    const descentUnits = Number.isFinite(rawDescent) ? Math.abs(rawDescent) : unitsPerEm * 0.2;
    const totalUnits = Math.max(unitsPerEm, ascentUnits + descentUnits);
    if (totalUnits <= 0 || !Number.isFinite(totalUnits)) {
      return undefined;
    }
    return {
      unitsPerEm,
      ascentUnits,
      descentUnits,
      totalUnits,
      ascentRatio: ascentUnits / totalUnits,
      descentRatio: descentUnits / totalUnits,
    };
  };

  const getFontWeight = (
    fontId: string | null | undefined,
    pageIndex: number | null | undefined,
  ): number | 'normal' | 'bold' => {
    if (!fontId) {
      return 'normal';
    }
    const font = resolveFont(fontId, pageIndex);
    if (!font || !font.fontDescriptorFlags) {
      return 'normal';
    }

    // PDF font descriptor flag bit 18 (value 262144 = 0x40000) indicates ForceBold
    const FORCE_BOLD_FLAG = 262144;
    if ((font.fontDescriptorFlags & FORCE_BOLD_FLAG) !== 0) {
      return 'bold';
    }

    // Also check if font name contains "Bold"
    const fontName = font.standard14Name || font.baseName || '';
    if (fontName.toLowerCase().includes('bold')) {
      return 'bold';
    }

    return 'normal';
  };

  const pages = pdfDocument?.pages ?? [];
  const currentPage = pages[selectedPage] ?? null;
  const pageGroups = groupsByPage[selectedPage] ?? [];
  const pageImages = imagesByPage[selectedPage] ?? [];

  const fontMetrics = useMemo(() => {
    const metrics = new Map<string, { unitsPerEm: number; ascent: number; descent: number }>();
    pdfDocument?.fonts?.forEach((font) => {
      if (!font?.id) {
        return;
      }
      const unitsPerEm = font.unitsPerEm && font.unitsPerEm > 0 ? font.unitsPerEm : 1000;
      const ascent = font.ascent ?? unitsPerEm;
      const descent = font.descent ?? -(unitsPerEm * 0.2);
      const metric = { unitsPerEm, ascent, descent };
      metrics.set(font.id, metric);
      if (font.uid) {
        metrics.set(font.uid, metric);
      }
      if (font.pageNumber !== null && font.pageNumber !== undefined) {
        metrics.set(`${font.pageNumber}:${font.id}`, metric);
      }
    });
    return metrics;
  }, [pdfDocument?.fonts]);

  useEffect(() => {
    if (typeof FontFace === 'undefined') {
      setFontFamilies(new Map());
      return undefined;
    }

    let disposed = false;
    const active: { fontFace: FontFace; url?: string }[] = [];

    const registerFonts = async () => {
      const fonts = pdfDocument?.fonts ?? [];
      if (fonts.length === 0) {
        setFontFamilies(new Map());
        return;
      }

      const next = new Map<string, string>();
      const pickFontSource = (
        font: PdfJsonFont
      ): { data: string; format?: string | null; source: 'pdfProgram' | 'webProgram' | 'program' } | null => {
        if (font.pdfProgram && font.pdfProgram.length > 0) {
          return { data: font.pdfProgram, format: font.pdfProgramFormat, source: 'pdfProgram' };
        }
        if (font.webProgram && font.webProgram.length > 0) {
          return { data: font.webProgram, format: font.webProgramFormat, source: 'webProgram' };
        }
        if (font.program && font.program.length > 0) {
          return { data: font.program, format: font.programFormat, source: 'program' };
        }
        return null;
      };

      const registerLoadedFontKeys = (font: PdfJsonFont, familyName: string) => {
        if (font.id) {
          next.set(font.id, familyName);
        }
        if (font.uid) {
          next.set(font.uid, familyName);
        }
        if (font.pageNumber !== null && font.pageNumber !== undefined && font.id) {
          next.set(`${font.pageNumber}:${font.id}`, familyName);
        }
      };

      for (const font of fonts) {
        if (!font || !font.id) {
          continue;
        }
        const selection = pickFontSource(font);
        if (!selection) {
          continue;
        }
        try {
          const formatSource = selection.format;
          const format = normalizeFontFormat(formatSource);
          const data = decodeBase64ToUint8Array(selection.data);
          const blob = new Blob([data as BlobPart], { type: getFontMimeType(format) });
          const url = URL.createObjectURL(blob);
          const formatHint = getFontFormatHint(format);
          const familyName = buildFontFamilyName(font);
          const source = formatHint ? `url(${url}) format('${formatHint}')` : `url(${url})`;
          const fontFace = new FontFace(familyName, source);

          console.debug(`[FontLoader] Loading font ${font.id} (${font.baseName}) using ${selection.source}:`, {
            formatSource,
            format,
            formatHint,
            familyName,
            dataLength: data.length,
            hasPdfProgram: !!font.pdfProgram,
            hasWebProgram: !!font.webProgram,
            hasProgram: !!font.program
          });

          await fontFace.load();
          if (disposed) {
            document.fonts.delete(fontFace);
            URL.revokeObjectURL(url);
            continue;
          }
          document.fonts.add(fontFace);
          active.push({ fontFace, url });
          registerLoadedFontKeys(font, familyName);
          console.debug(`[FontLoader] Successfully loaded font ${font.id}`);
        } catch (error) {
          console.warn(`[FontLoader] Failed to load font ${font.id} (${font.baseName}) using ${selection.source}:`, {
            error: error instanceof Error ? error.message : String(error),
            formatSource: selection.format,
            hasPdfProgram: !!font.pdfProgram,
            hasWebProgram: !!font.webProgram,
            hasProgram: !!font.program
          });
          // Fallback to web-safe fonts is already implemented via getFontFamily()
        }
      }

      if (!disposed) {
        setFontFamilies(next);
      } else {
        active.forEach(({ fontFace, url }) => {
          document.fonts.delete(fontFace);
          if (url) {
            URL.revokeObjectURL(url);
          }
        });
      }
    };

    registerFonts();

    return () => {
      disposed = true;
      active.forEach(({ fontFace, url }) => {
        document.fonts.delete(fontFace);
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [pdfDocument?.fonts]);
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
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  width: '100%',
                  minHeight: '100%',
                }}
              >
                <Box
                  style={{
                    background: '#f3f4f6',
                    padding: '0.5rem',
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
                        onDrag={(_event, data) => {
                          emitImageTransform(
                            imageId,
                            data.x,
                            data.y,
                            cssWidth,
                            cssHeight,
                          );
                        }}
                        onDragStop={(_event, data) => {
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
                        onResize={(_event, _direction, ref, _delta, position) => {
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
                        onResizeStop={(_event, _direction, ref, _delta, position) => {
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
                      const fontFamily = getFontFamily(group.fontId, group.pageIndex);
                      let lineHeightPx = getLineHeightPx(group.fontId, group.pageIndex, fontSizePx);
                      let lineHeightRatio = fontSizePx > 0 ? Math.max(lineHeightPx / fontSizePx, 1.05) : 1.2;
                      const rotation = group.rotation ?? 0;
                      const hasRotation = Math.abs(rotation) > 0.5;
                      const baselineLength = group.baselineLength ?? Math.max(group.bounds.right - group.bounds.left, 0);
                      const geometry = getFontGeometry(group.fontId, group.pageIndex);
                      const ascentPx = geometry ? Math.max(fontSizePx * geometry.ascentRatio, fontSizePx * 0.7) : fontSizePx * 0.82;
                      const descentPx = geometry ? Math.max(fontSizePx * geometry.descentRatio, fontSizePx * 0.2) : fontSizePx * 0.22;
                      lineHeightPx = Math.max(lineHeightPx, ascentPx + descentPx);
                      if (fontSizePx > 0) {
                        lineHeightRatio = Math.max(lineHeightRatio, lineHeightPx / fontSizePx);
                      }

                      let containerLeft = bounds.left;
                      let containerTop = bounds.top;
                      let containerWidth = Math.max(bounds.width, fontSizePx);
                      let containerHeight = Math.max(bounds.height, lineHeightPx);
                      let transform: string | undefined;
                      let transformOrigin: React.CSSProperties['transformOrigin'];

                      if (hasRotation) {
                        const anchorX = group.anchor?.x ?? group.bounds.left;
                        const anchorY = group.anchor?.y ?? group.bounds.bottom;
                        containerLeft = anchorX * scale;
                        const anchorTop = Math.max(pageHeight - anchorY, 0) * scale;
                        containerWidth = Math.max(baselineLength * scale, MIN_BOX_SIZE);
                        containerHeight = Math.max(lineHeightPx, fontSizePx * lineHeightRatio);
                        transformOrigin = 'left bottom';
                        // Negate rotation because Y-axis is flipped from PDF to web coordinates
                        transform = `rotate(${-rotation}deg)`;
                        // Align the baseline (PDF anchor) with the bottom edge used as the
                        // transform origin. Without this adjustment rotated text appears shifted
                        // downward by roughly one line height.
                        containerTop = anchorTop - containerHeight;
                      }

                      if (!hasRotation && group.baseline !== null && group.baseline !== undefined && geometry) {
                        const cssBaselineTop = (pageHeight - group.baseline) * scale;
                        containerTop = Math.max(cssBaselineTop - ascentPx, 0);
                        containerHeight = Math.max(containerHeight, ascentPx + descentPx);
                      }

                      // Extract styling from group
                      const textColor = group.color || '#111827';
                      const fontWeight = group.fontWeight || getFontWeight(group.fontId, group.pageIndex);

                      const containerStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: `${containerLeft}px`,
                        top: `${containerTop}px`,
                        width: `${containerWidth}px`,
                        height: `${containerHeight}px`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        pointerEvents: 'auto',
                        cursor: 'text',
                        zIndex: 2_000_000,
                        transform,
                        transformOrigin,
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
                                  padding: 0,
                                  backgroundColor: 'rgba(255,255,255,0.95)',
                                  color: textColor,
                                  fontSize: `${fontSizePx}px`,
                                  fontFamily,
                                  fontWeight,
                                  lineHeight: lineHeightRatio,
                                  outline: 'none',
                                  border: 'none',
                                  display: 'block',
                                  whiteSpace: 'nowrap',
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
                                padding: 0,
                                whiteSpace: 'nowrap',
                                fontSize: `${fontSizePx}px`,
                                fontFamily,
                                fontWeight,
                                lineHeight: lineHeightRatio,
                                color: textColor,
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
              </Box>
            </ScrollArea>
          </Card>

          <Card padding="md" withBorder radius="md">
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={500}>{t('pdfJsonEditor.groupList', 'Detected Text Groups')}</Text>
                <ActionIcon
                  variant="subtle"
                  onClick={() => setTextGroupsExpanded(!textGroupsExpanded)}
                  aria-label={textGroupsExpanded ? 'Collapse' : 'Expand'}
                >
                  {textGroupsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </ActionIcon>
              </Group>
              <Collapse in={textGroupsExpanded}>
                <Stack gap="xs">
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
              </Collapse>
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  );
};

export default PdfJsonEditorView;
