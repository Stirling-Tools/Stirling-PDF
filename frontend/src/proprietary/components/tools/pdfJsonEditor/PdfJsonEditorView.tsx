import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
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
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UploadIcon from '@mui/icons-material/Upload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import { Rnd } from 'react-rnd';

import {
  PdfJsonEditorViewData,
  PdfJsonFont,
  PdfJsonPage,
  ConversionProgress,
} from '@app/tools/pdfJsonEditor/pdfJsonEditorTypes';
import { getImageBounds, pageDimensions } from '@app/tools/pdfJsonEditor/pdfJsonEditorUtils';
import FontStatusPanel from '@app/components/tools/pdfJsonEditor/FontStatusPanel';

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

/**
 * Analyzes text groups on a page to determine if it's paragraph-heavy or sparse.
 * Returns true if the page appears to be document-like with substantial text content.
 */
const analyzePageContentType = (groups: TextGroup[]): boolean => {
  if (groups.length === 0) return false;

  let multiLineGroups = 0;
  let totalWords = 0;
  let longTextGroups = 0;
  let totalGroups = 0;
  const groupDetails: Array<{
    id: string;
    lines: number;
    words: number;
    chars: number;
    text: string;
  }> = [];

  groups.forEach((group) => {
    const text = (group.text || '').trim();
    if (text.length === 0) return;

    totalGroups++;
    const lines = text.split('\n');
    const lineCount = lines.length;
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    totalWords += wordCount;

    // Count multi-line paragraphs
    if (lineCount > 1) {
      multiLineGroups++;
    }

    // Count text groups with substantial content (more than a few words)
    if (wordCount >= 5 || text.length >= 30) {
      longTextGroups++;
    }

    groupDetails.push({
      id: group.id,
      lines: lineCount,
      words: wordCount,
      chars: text.length,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
    });
  });

  if (totalGroups === 0) return false;

  // Heuristics for paragraph mode:
  // 1. Has multiple substantial multi-line groups (2+) AND decent average words
  // 2. Average words per group > 12 (strong indicator of document text)
  // 3. More than 40% of groups have substantial text (typical of documents)
  const avgWordsPerGroup = totalWords / totalGroups;
  const longTextRatio = longTextGroups / totalGroups;

  const isParagraphPage =
    (multiLineGroups >= 2 && avgWordsPerGroup > 8) ||
    avgWordsPerGroup > 12 ||
    longTextRatio > 0.4;

  // Log detailed statistics
  console.group(`📊 Page Content Analysis`);
  console.log('📄 Overall Statistics:');
  console.log(`  Total text groups: ${totalGroups}`);
  console.log(`  Total words: ${totalWords}`);
  console.log(`  Average words per group: ${avgWordsPerGroup.toFixed(2)}`);
  console.log(`  Multi-line groups: ${multiLineGroups}`);
  console.log(`  Long text groups (≥5 words or ≥30 chars): ${longTextGroups}`);
  console.log(`  Long text ratio: ${(longTextRatio * 100).toFixed(1)}%`);
  console.log('');
  console.log('🔍 Detection Criteria:');
  console.log(`  ✓ Multi-line groups ≥ 2 AND avg words > 8? ${multiLineGroups >= 2 && avgWordsPerGroup > 8 ? '✅ YES' : '❌ NO'} (multi-line: ${multiLineGroups}, avg: ${avgWordsPerGroup.toFixed(2)})`);
  console.log(`  ✓ Avg words/group > 12? ${avgWordsPerGroup > 12 ? '✅ YES' : '❌ NO'} (current: ${avgWordsPerGroup.toFixed(2)})`);
  console.log(`  ✓ Long text ratio > 40%? ${longTextRatio > 0.4 ? '✅ YES' : '❌ NO'} (current: ${(longTextRatio * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`📋 Result: ${isParagraphPage ? '📝 PARAGRAPH PAGE' : '📄 SPARSE PAGE'}`);
  console.log('');
  console.log('📦 Individual Groups:');
  console.table(groupDetails);
  console.groupEnd();

  return isParagraphPage;
};

type GroupingMode = 'auto' | 'paragraph' | 'singleLine';

const PdfJsonEditorView = ({ data }: PdfJsonEditorViewProps) => {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [fontFamilies, setFontFamilies] = useState<Map<string, string>>(new Map());
  const [textGroupsExpanded, setTextGroupsExpanded] = useState(false);
  const [autoScaleText, setAutoScaleText] = useState(true);
  const [textScales, setTextScales] = useState<Map<string, number>>(new Map());
  const measurementKeyRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const caretOffsetsRef = useRef<Map<string, number>>(new Map());

  const {
    document: pdfDocument,
    groupsByPage,
    imagesByPage,
    pagePreviews,
    selectedPage,
    dirtyPages,
    hasDocument,
    hasVectorPreview,
    fileName,
    errorMessage,
    isGeneratingPdf,
    isConverting,
    conversionProgress,
    hasChanges,
    forceSingleTextElement,
    groupingMode: externalGroupingMode,
    requestPagePreview,
    onLoadJson,
    onSelectPage,
    onGroupEdit,
    onGroupDelete,
    onImageTransform,
    onImageReset,
    onReset,
    onDownloadJson,
    onGeneratePdf,
    onForceSingleTextElementChange,
    onGroupingModeChange,
  } = data;

  const syncEditorValue = useCallback(
    (element: HTMLElement, pageIndex: number, groupId: string) => {
      const value = element.innerText.replace(/\u00A0/g, ' ');
      const offset = getCaretOffset(element);
      caretOffsetsRef.current.set(groupId, offset);
      onGroupEdit(pageIndex, groupId, value);
      requestAnimationFrame(() => {
        if (editingGroupId !== groupId) {
          return;
        }
        const editor = editorRefs.current.get(groupId);
        if (editor) {
          const savedOffset = caretOffsetsRef.current.get(groupId) ?? editor.innerText.length;
          setCaretOffset(editor, savedOffset);
        }
      });
    },
    [editingGroupId, onGroupEdit],
  );

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
  const pagePreview = pagePreviews.get(selectedPage);

  // Detect if current page contains paragraph-heavy content
  const isParagraphPage = useMemo(() => analyzePageContentType(pageGroups), [pageGroups]);

  const extractPreferredFontId = useCallback((target?: TextGroup | null) => {
    if (!target) {
      return undefined;
    }
    if (target.fontId) {
      return target.fontId;
    }
    for (const element of target.originalElements ?? []) {
      if (element.fontId) {
        return element.fontId;
      }
    }
    for (const element of target.elements ?? []) {
      if (element.fontId) {
        return element.fontId;
      }
    }
    return undefined;
  }, []);

  const resolveFontIdForIndex = useCallback(
    (index: number): string | null | undefined => {
      if (index < 0 || index >= pageGroups.length) {
        return undefined;
      }
      const direct = extractPreferredFontId(pageGroups[index]);
      if (direct) {
        return direct;
      }
      for (let offset = 1; offset < pageGroups.length; offset += 1) {
        const prevIndex = index - offset;
        if (prevIndex >= 0) {
          const candidate = extractPreferredFontId(pageGroups[prevIndex]);
          if (candidate) {
            return candidate;
          }
        }
        const nextIndex = index + offset;
        if (nextIndex < pageGroups.length) {
          const candidate = extractPreferredFontId(pageGroups[nextIndex]);
          if (candidate) {
            return candidate;
          }
        }
      }
      return undefined;
    },
    [extractPreferredFontId, pageGroups],
  );

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
      pageGroups
        .map((group, index) => ({ group, pageGroupIndex: index }))
        .filter(({ group }) => {
          const hasContent =
            ((group.text ?? '').trim().length > 0) ||
            ((group.originalText ?? '').trim().length > 0);
          return hasContent || editingGroupId === group.id;
        }),
    [editingGroupId, pageGroups],
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
    if (!hasDocument || !hasVectorPreview) {
      return;
    }
    requestPagePreview(selectedPage, scale);
    if (selectedPage + 1 < pages.length) {
      requestPagePreview(selectedPage + 1, scale);
    }
  }, [hasDocument, hasVectorPreview, selectedPage, scale, pages.length, requestPagePreview]);

  useEffect(() => {
    setActiveGroupId(null);
    setEditingGroupId(null);
    setActiveImageId(null);
    setTextScales(new Map());
    measurementKeyRef.current = '';
  }, [selectedPage]);

  // Measure text widths once per page/configuration and apply static scaling
  useLayoutEffect(() => {
    if (!autoScaleText) {
      // Clear all scales when auto-scale is disabled
      setTextScales(new Map());
      measurementKeyRef.current = '';
      return;
    }

    if (visibleGroups.length === 0) {
      return;
    }

    // Create a stable key for this measurement configuration
    const currentKey = `${selectedPage}-${fontFamilies.size}-${autoScaleText}`;

    // Skip if we've already measured for this configuration
    if (measurementKeyRef.current === currentKey) {
      return;
    }

    const measureTextScales = () => {
      const newScales = new Map<string, number>();

      visibleGroups.forEach(({ group }) => {
        // Skip groups that are being edited
        if (editingGroupId === group.id) {
          return;
        }

        // Skip multi-line paragraphs - auto-scaling doesn't work well with wrapped text
        const lineCount = (group.text || '').split('\n').length;
        if (lineCount > 1) {
          newScales.set(group.id, 1);
          return;
        }

        const element = document.querySelector<HTMLElement>(`[data-text-group="${group.id}"]`);
        if (!element) {
          return;
        }

        const textSpan = element.querySelector<HTMLSpanElement>('span[data-text-content]');
        if (!textSpan) {
          return;
        }

        // Temporarily remove any existing transform to get natural width
        const originalTransform = textSpan.style.transform;
        textSpan.style.transform = 'none';

        const bounds = toCssBounds(currentPage, pageHeight, scale, group.bounds);
        const containerWidth = bounds.width;
        const textWidth = textSpan.getBoundingClientRect().width;

        // Restore original transform
        textSpan.style.transform = originalTransform;

        // Only scale if text overflows by more than 2%
        if (textWidth > 0 && textWidth > containerWidth * 1.02) {
          const scaleX = Math.max(containerWidth / textWidth, 0.5); // Min 50% scale
          newScales.set(group.id, scaleX);
        } else {
          newScales.set(group.id, 1);
        }
      });

      // Mark this configuration as measured
      measurementKeyRef.current = currentKey;
      setTextScales(newScales);
    };

    // Delay measurement to ensure fonts and layout are ready
    const timer = setTimeout(measureTextScales, 150);
    return () => clearTimeout(timer);
  }, [
    autoScaleText,
    visibleGroups,
    editingGroupId,
    currentPage,
    pageHeight,
    scale,
    fontFamilies.size,
    selectedPage,
  ]);

  useLayoutEffect(() => {
    // Only restore caret position during re-renders while already editing
    // Don't interfere with initial click-to-position behavior
    if (!editingGroupId) {
      return;
    }
    const editor = editorRefs.current.get(editingGroupId);
    if (!editor) {
      return;
    }
    const offset = caretOffsetsRef.current.get(editingGroupId);
    // Only restore if we have a saved offset (meaning user was already typing)
    if (offset === undefined || offset === 0) {
      return;
    }
    setCaretOffset(editor, offset);
  }, [editingGroupId, groupsByPage, imagesByPage]);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const editor = document.querySelector<HTMLElement>(`[data-editor-group="${editingGroupId}"]`);
    if (editor) {
      if (document.activeElement !== editor) {
        editor.focus();
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
    pageIndex: number,
    isActive: boolean,
    isChanged: boolean,
    content: React.ReactNode,
    onActivate?: (event: React.MouseEvent) => void,
    onClick?: (event: React.MouseEvent) => void,
  ) => (
    <Box
      component="div"
      style={{
        width: 'calc(100% + 4px)',
        height: 'calc(100% + 6px)',
        marginLeft: '-2px',
        marginTop: '-3px',
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
        padding: '3px 2px 3px 2px',
        position: 'relative',
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (onClick) {
          onClick(event);
        } else {
          onActivate?.(event);
        }
      }}
    >
      {content}
      {activeGroupId === groupId && (
        <ActionIcon
          size="xs"
          variant="filled"
          color="red"
          radius="xl"
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            zIndex: 10,
            cursor: 'pointer',
          }}
          onClick={(event) => {
            event.stopPropagation();
            onGroupDelete(pageIndex, groupId);
            setActiveGroupId(null);
            setEditingGroupId(null);
          }}
        >
          <CloseIcon style={{ fontSize: 12 }} />
        </ActionIcon>
      )}
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
    <Stack
      gap="xl"
      className="h-full"
      style={{
        padding: '1.5rem',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        alignItems: 'start',
        gap: '1.5rem',
      }}
    >
      <Card
        withBorder
        radius="md"
        shadow="xs"
        padding="md"
        style={{
          gridColumn: '2 / 3',
          gridRow: 1,
          maxHeight: 'calc(100vh - 3rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
          <Stack gap="sm" pb="md">
            <Group justify="space-between" align="center">
              <Group gap="xs" align="center">
                <DescriptionIcon fontSize="small" />
                <Title order={3}>{t('pdfJsonEditor.title', 'PDF JSON Editor')}</Title>
                {hasChanges && <Badge color="yellow" size="sm">{t('pdfJsonEditor.badges.unsaved', 'Edited')}</Badge>}
              </Group>
            </Group>

            <Stack gap="xs">
              <FileButton onChange={onLoadJson} accept="application/pdf,application/json,.pdf,.json">
                {(props) => (
                  <Button
                    variant="light"
                    leftSection={<UploadIcon fontSize="small" />}
                    loading={isConverting}
                    fullWidth
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
                fullWidth
              >
                {t('pdfJsonEditor.actions.reset', 'Reset Changes')}
              </Button>
              <Button
                variant="default"
                leftSection={<FileDownloadIcon fontSize="small" />}
                onClick={onDownloadJson}
                disabled={!hasDocument || isConverting}
                fullWidth
              >
                {t('pdfJsonEditor.actions.downloadJson', 'Download JSON')}
              </Button>
              <Button
                leftSection={<PictureAsPdfIcon fontSize="small" />}
                onClick={onGeneratePdf}
                loading={isGeneratingPdf}
                disabled={!hasDocument || !hasChanges || isConverting}
                fullWidth
              >
                {t('pdfJsonEditor.actions.generatePdf', 'Generate PDF')}
              </Button>
            </Stack>

            {fileName && (
              <Text size="sm" c="dimmed">
                {t('pdfJsonEditor.currentFile', 'Current file: {{name}}', { name: fileName })}
              </Text>
            )}

            <Divider my="xs" />

            <Group justify="space-between" align="center">
              <div>
                <Text fw={500} size="sm">
                  {t('pdfJsonEditor.options.autoScaleText.title', 'Auto-scale text to fit boxes')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    'pdfJsonEditor.options.autoScaleText.description',
                    'Automatically scales text horizontally to fit within its original bounding box when font rendering differs from PDF.'
                  )}
                </Text>
              </div>
              <Switch
                size="md"
                checked={autoScaleText}
                onChange={(event) => setAutoScaleText(event.currentTarget.checked)}
              />
            </Group>

            <Stack gap="xs">
              <Group gap={4} align="center">
                <Text fw={500} size="sm">
                  {t('pdfJsonEditor.options.groupingMode.title', 'Text Grouping Mode')}
                </Text>
                {externalGroupingMode === 'auto' && isParagraphPage && (
                  <Badge size="xs" color="blue" variant="light">
                    {t('pdfJsonEditor.pageType.paragraph', 'Paragraph page')}
                  </Badge>
                )}
                {externalGroupingMode === 'auto' && !isParagraphPage && hasDocument && (
                  <Badge size="xs" color="gray" variant="light">
                    {t('pdfJsonEditor.pageType.sparse', 'Sparse text')}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {externalGroupingMode === 'auto'
                  ? t(
                      'pdfJsonEditor.options.groupingMode.autoDescription',
                      'Automatically detects page type and groups text appropriately.'
                    )
                  : externalGroupingMode === 'paragraph'
                    ? t(
                        'pdfJsonEditor.options.groupingMode.paragraphDescription',
                        'Groups aligned lines into multi-line paragraph text boxes.'
                      )
                    : t(
                        'pdfJsonEditor.options.groupingMode.singleLineDescription',
                        'Keeps each PDF text line as a separate text box.'
                      )}
              </Text>
              <SegmentedControl
                value={externalGroupingMode}
                onChange={(value) => onGroupingModeChange(value as GroupingMode)}
                data={[
                  { label: t('pdfJsonEditor.groupingMode.auto', 'Auto'), value: 'auto' },
                  { label: t('pdfJsonEditor.groupingMode.paragraph', 'Paragraph'), value: 'paragraph' },
                  { label: t('pdfJsonEditor.groupingMode.singleLine', 'Single Line'), value: 'singleLine' },
                ]}
                fullWidth
              />
            </Stack>

            <Group justify="space-between" align="center">
              <div>
                <Text fw={500} size="sm">
                  {t('pdfJsonEditor.options.forceSingleElement.title', 'Lock edited text to a single PDF element')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    'pdfJsonEditor.options.forceSingleElement.description',
                    'When enabled, the editor exports each edited text box as one PDF text element to avoid overlapping glyphs or mixed fonts.'
                  )}
                </Text>
              </div>
              <Switch
                size="md"
                checked={forceSingleTextElement}
                onChange={(event) => onForceSingleTextElementChange(event.currentTarget.checked)}
              />
            </Group>

            <Divider my="xs" />

            <Accordion variant="contained">
              <Accordion.Item value="disclaimer">
                <Accordion.Control>
                  <Group gap="xs" wrap="nowrap">
                    <InfoOutlinedIcon fontSize="small" />
                    <Text size="sm" fw={500}>
                      {t('pdfJsonEditor.disclaimer.heading', 'Preview Limitations')}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={4}>
                    <Text size="xs">
                      {t(
                        'pdfJsonEditor.disclaimer.textFocus',
                        'This workspace focuses on editing text and repositioning embedded images. Complex page artwork, form widgets, and layered graphics are preserved for export but are not fully editable here.'
                      )}
                    </Text>
                    <Text size="xs">
                      {t(
                        'pdfJsonEditor.disclaimer.previewVariance',
                        'Some visuals (such as table borders, shapes, or annotation appearances) may not display exactly in the preview. The exported PDF keeps the original drawing commands whenever possible.'
                      )}
                    </Text>
                    <Text size="xs">
                      {t(
                        'pdfJsonEditor.disclaimer.alpha',
                        'This alpha viewer is still evolving—certain fonts, colours, transparency effects, and layout details may shift slightly. Please double-check the generated PDF before sharing.'
                      )}
                    </Text>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            {hasDocument && <FontStatusPanel document={pdfDocument} pageIndex={selectedPage} />}
          </Stack>
        </ScrollArea>
      </Card>

      {hasDocument && (
        <Card
          withBorder
          radius="md"
          padding="md"
          shadow="xs"
          style={{ gridColumn: '2 / 3' }}
        >
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
              <ScrollArea h={240} offsetScrollbars>
                <Stack gap="sm">
                  {visibleGroups.map(({ group }) => {
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
                            {group.fontId && <Badge size="xs" variant="outline">{group.fontId}</Badge>}
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
            </Collapse>
          </Stack>
        </Card>
      )}

      {errorMessage && (
        <Alert
          icon={<WarningAmberIcon fontSize="small" />}
          color="red"
          radius="md"
          style={{ gridColumn: '2 / 3' }}
        >
          {errorMessage}
        </Alert>
      )}

      {!hasDocument && !isConverting && (
        <Card withBorder radius="md" padding="xl" style={{ gridColumn: '1 / 2', gridRow: 1 }}>
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
        <Card withBorder radius="md" padding="xl" style={{ gridColumn: '1 / 2', gridRow: 1 }}>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div style={{ flex: 1 }}>
                <Text size="lg" fw={600} mb="xs">
                  {conversionProgress
                    ? conversionProgress.message
                    : t('pdfJsonEditor.converting', 'Converting PDF to editable format...')}
                </Text>
                {conversionProgress && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed" tt="capitalize">
                      {t(`pdfJsonEditor.stages.${conversionProgress.stage}`, conversionProgress.stage)}
                    </Text>
                    {conversionProgress.current !== undefined &&
                      conversionProgress.total !== undefined && (
                        <Text size="sm" c="dimmed">
                          • Page {conversionProgress.current} of {conversionProgress.total}
                        </Text>
                      )}
                  </Group>
                )}
              </div>
              <AutorenewIcon sx={{ fontSize: 36 }} className="animate-spin" />
            </Group>
            <Progress value={conversionProgress?.percent || 0} size="lg" radius="md" />
          </Stack>
        </Card>
      )}

      {hasDocument && (
        <Stack gap="lg" className="flex-1" style={{ gridColumn: '1 / 2', gridRow: 1, minHeight: 0 }}>
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
                    {pagePreview && (
                      <img
                        src={pagePreview}
                        alt={t('pdfJsonEditor.pagePreviewAlt', 'Page preview')}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          pointerEvents: 'none',
                          userSelect: 'none',
                          zIndex: 0,
                        }}
                      />
                    )}
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
                    visibleGroups.map(({ group, pageGroupIndex }) => {
                      const bounds = toCssBounds(currentPage, pageHeight, scale, group.bounds);
                      const changed = group.text !== group.originalText;
                      const isActive = activeGroupId === group.id || editingGroupId === group.id;
                      const isEditing = editingGroupId === group.id;
                      const baseFontSize = group.fontMatrixSize ?? group.fontSize ?? 12;
                      const fontSizePx = Math.max(baseFontSize * scale, 6);
                      const effectiveFontId = resolveFontIdForIndex(pageGroupIndex) ?? group.fontId;
                      const fontFamily = getFontFamily(effectiveFontId, group.pageIndex);
                      let lineHeightPx = getLineHeightPx(effectiveFontId, group.pageIndex, fontSizePx);
                      let lineHeightRatio = fontSizePx > 0 ? Math.max(lineHeightPx / fontSizePx, 1.05) : 1.2;
                      const rotation = group.rotation ?? 0;
                      const hasRotation = Math.abs(rotation) > 0.5;
                      const baselineLength = group.baselineLength ?? Math.max(group.bounds.right - group.bounds.left, 0);
                      const geometry = getFontGeometry(effectiveFontId, group.pageIndex);
                      const ascentPx = geometry ? Math.max(fontSizePx * geometry.ascentRatio, fontSizePx * 0.7) : fontSizePx * 0.82;
                      const descentPx = geometry ? Math.max(fontSizePx * geometry.descentRatio, fontSizePx * 0.2) : fontSizePx * 0.22;
                      lineHeightPx = Math.max(lineHeightPx, ascentPx + descentPx);
                      if (fontSizePx > 0) {
                        lineHeightRatio = Math.max(lineHeightRatio, lineHeightPx / fontSizePx);
                      }
                      const detectedSpacingPx =
                        group.lineSpacing && group.lineSpacing > 0 ? group.lineSpacing * scale : undefined;
                      if (detectedSpacingPx && detectedSpacingPx > 0) {
                        lineHeightPx = Math.max(lineHeightPx, detectedSpacingPx);
                        if (fontSizePx > 0) {
                          lineHeightRatio = Math.max(lineHeightRatio, detectedSpacingPx / fontSizePx);
                        }
                      }
                      const lineCount = Math.max(group.text.split('\n').length, 1);
                      const paragraphHeightPx =
                        lineCount > 1
                          ? lineHeightPx + (lineCount - 1) * (detectedSpacingPx ?? lineHeightPx)
                          : lineHeightPx;

                      let containerLeft = bounds.left;
                      let containerTop = bounds.top;
                      let containerWidth = Math.max(bounds.width, fontSizePx);
                      let containerHeight = Math.max(bounds.height, paragraphHeightPx);
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

                      if (
                        lineCount === 1 &&
                        !hasRotation &&
                        group.baseline !== null &&
                        group.baseline !== undefined &&
                        geometry
                      ) {
                        const cssBaselineTop = (pageHeight - group.baseline) * scale;
                        containerTop = Math.max(cssBaselineTop - ascentPx, 0);
                        containerHeight = Math.max(containerHeight, ascentPx + descentPx);
                      }

                      // Extract styling from group
                      const textColor = group.color || '#111827';
                      const fontWeight = group.fontWeight || getFontWeight(effectiveFontId, group.pageIndex);

                      const containerStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: `${containerLeft}px`,
                        top: `${containerTop}px`,
                        width: `${containerWidth}px`,
                        height: isEditing ? 'auto' : `${containerHeight}px`,
                        minHeight: `${containerHeight}px`,
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
                              group.pageIndex,
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
                                onFocus={(event) => {
                                  const primaryFont = fontFamily.split(',')[0]?.replace(/['"]/g, '').trim();
                                  if (primaryFont && typeof document !== 'undefined') {
                                    try {
                                      if (document.queryCommandSupported?.('styleWithCSS')) {
                                        document.execCommand('styleWithCSS', false, true);
                                      }
                                      if (document.queryCommandSupported?.('fontName')) {
                                        document.execCommand('fontName', false, primaryFont);
                                      }
                                    } catch {
                                      // ignore execCommand failures; inline style already enforces font
                                    }
                                  }
                                  event.currentTarget.style.fontFamily = fontFamily;
                                }}
                                onClick={(event) => {
                                  // Allow click position to determine cursor placement
                                  event.stopPropagation();
                                }}
                                onBlur={(event) => {
                                  const value = event.currentTarget.innerText.replace(/\u00A0/g, ' ');
                                  caretOffsetsRef.current.delete(group.id);
                                  editorRefs.current.delete(group.id);
                                  setActiveGroupId(null);
                                  onGroupEdit(group.pageIndex, group.id, value);
                                  setEditingGroupId(null);
                                }}
                                onInput={(event) => {
                                  syncEditorValue(event.currentTarget, group.pageIndex, group.id);
                                }}
                                style={{
                                  width: '100%',
                                  minHeight: '100%',
                                  height: 'auto',
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
                                  whiteSpace: 'pre',
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

                      const textScale = textScales.get(group.id) ?? 1;
                      const shouldScale = autoScaleText && textScale < 0.98;

                      return (
                        <Box key={group.id} style={containerStyle}>
                          {renderGroupContainer(
                            group.id,
                            group.pageIndex,
                            isActive,
                            changed,
                            <div
                              data-text-group={group.id}
                              style={{
                                width: '100%',
                                minHeight: '100%',
                                padding: 0,
                                whiteSpace: 'pre',
                                fontSize: `${fontSizePx}px`,
                                fontFamily,
                                fontWeight,
                                lineHeight: lineHeightRatio,
                                color: textColor,
                                display: 'block',
                                cursor: 'text',
                                overflow: 'hidden',
                              }}
                            >
                              <span
                                data-text-content
                                style={{
                                  pointerEvents: 'none',
                                  display: 'inline-block',
                                  transform: shouldScale ? `scaleX(${textScale})` : 'none',
                                  transformOrigin: 'left center',
                                  whiteSpace: 'pre',
                                }}
                              >
                                {group.text || '\u00A0'}
                              </span>
                            </div>,
                            undefined,
                            (event: React.MouseEvent) => {
                              const clickX = event.clientX;
                              const clickY = event.clientY;

                              setActiveGroupId(group.id);
                              setEditingGroupId(group.id);
                              caretOffsetsRef.current.delete(group.id);

                              requestAnimationFrame(() => {
                                const editor = document.querySelector<HTMLElement>(`[data-editor-group="${group.id}"]`);
                                if (!editor) return;
                                editor.focus();

                                setTimeout(() => {
                                  if (document.caretRangeFromPoint) {
                                    const range = document.caretRangeFromPoint(clickX, clickY);
                                    if (range) {
                                      const selection = window.getSelection();
                                      if (selection) {
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                      }
                                    }
                                  } else if ((document as any).caretPositionFromPoint) {
                                    const pos = (document as any).caretPositionFromPoint(clickX, clickY);
                                    if (pos) {
                                      const range = document.createRange();
                                      range.setStart(pos.offsetNode, pos.offset);
                                      range.collapse(true);
                                      const selection = window.getSelection();
                                      if (selection) {
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                      }
                                    }
                                  }
                                }, 10);
                              });
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

        </Stack>
      )}
    </Stack>
  );
};

export default PdfJsonEditorView;
