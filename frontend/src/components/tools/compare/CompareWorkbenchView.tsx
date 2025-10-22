import React, { ForwardedRef, JSX, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Stack, Text, Paper, Combobox, useCombobox, ScrollArea, ActionIcon } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import {
  ADDITION_HIGHLIGHT,
  CompareDiffToken,
  CompareResultData,
  CompareTokenMetadata,
  REMOVAL_HIGHLIGHT,
  TokenBoundingBox,
} from '../../../types/compare';
import type { FileId } from '../../../types/file';
import type { StirlingFileStub, StirlingFile } from '../../../types/fileContext';
import { useFilesModalContext } from '../../../contexts/FilesModalContext';
import { useFileActions, useFileContext } from '../../../contexts/file/fileHooks';
import { pdfWorkerManager } from '../../../services/pdfWorkerManager';
import './compareView.css';
import { tokenize, diffWords, shouldConcatWithoutSpace } from '../../../utils/textDiff';
import LocalIcon from '../../shared/LocalIcon';
import { Tooltip } from '../../shared/Tooltip';
import { useRightRailButtons } from '../../../hooks/useRightRailButtons';
import { alert } from '../../toast';
import type { ToastLocation } from '../../toast/types';
import { useMediaQuery } from '@mantine/hooks';

type ViewMode = 'diff';

interface CompareWorkbenchData {
  result: CompareResultData | null;
  baseFileId: FileId | null;
  comparisonFileId: FileId | null;
  onSelectBase?: (fileId: FileId | null) => void;
  onSelectComparison?: (fileId: FileId | null) => void;
  isLoading?: boolean;
  // Optional direct file references used when files were not added to workbench
  baseLocalFile?: StirlingFile | null;
  comparisonLocalFile?: StirlingFile | null;
}

interface CompareWorkbenchViewProps {
  data: CompareWorkbenchData | null;
}

interface PagePreview {
  pageNumber: number;
  width: number;
  height: number;
  url: string;
}

type HighlightMap = Map<number, TokenBoundingBox[]>;

const toRgba = (hexColor: string, alpha: number): string => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return hexColor;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};


const renderInlineParagraph = (baseText: string, comparisonText: string, side: 'base' | 'comparison') => {
  const a = tokenize(baseText);
  const b = tokenize(comparisonText);
  const tokens = diffWords(a, b);

  type SegmentType = 'unchanged' | 'added' | 'removed';
  type Segment = { type: SegmentType; text: string };

  const segments: Segment[] = [];

  const append = (segmentType: SegmentType, word: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === segmentType) {
      // join to existing segment with natural spacing
      if (last.text.length > 0 && !shouldConcatWithoutSpace(word)) {
        last.text += ' ' + word;
      } else {
        last.text += word;
      }
    } else {
      segments.push({ type: segmentType, text: word });
    }
  };

  for (const token of tokens) {
    if (side === 'base' && token.type === 'added') continue;
    if (side === 'comparison' && token.type === 'removed') continue;
    append(token.type as SegmentType, token.text);
  }

  return (
    <Text size="sm">
      {segments.map((seg, idx) => {
        if (seg.type === 'unchanged') {
          return <span key={`seg-${idx}`}>{seg.text}</span>;
        }
        const className = seg.type === 'added' ? 'compare-inline compare-inline--added' : 'compare-inline compare-inline--removed';
        return (
          <span key={`seg-${idx}`} className={className}>
            {seg.text}
          </span>
        );
      })}
    </Text>
  );
};

// Reuse summary inline algorithm to generate absolute positioned overlays for PDF pages
const computeInlineWordRects = (
  pageNumber: number,
  side: 'base' | 'comparison',
  tokens: CompareDiffToken[],
  metadata: CompareTokenMetadata[]
) => {
  const rects: { bbox: TokenBoundingBox; type: 'added' | 'removed' }[] = [];
  let index = 0;
  for (const token of tokens) {
    const meta = metadata[index] ?? null;
    if (token.type !== 'unchanged' && meta?.bbox && meta.page === pageNumber) {
      rects.push({ bbox: meta.bbox, type: token.type === 'added' ? 'added' : 'removed' });
    }
    if (side === 'base' && token.type !== 'added') index += 1;
    if (side === 'comparison' && token.type !== 'removed') index += 1;
  }
  return rects;
};

const buildHighlightMaps = (
  tokens: CompareDiffToken[],
  baseMetadata: CompareTokenMetadata[],
  comparisonMetadata: CompareTokenMetadata[]
): { base: HighlightMap; comparison: HighlightMap } => {
  const baseHighlights: HighlightMap = new Map();
  const comparisonHighlights: HighlightMap = new Map();

  let baseIndex = 0;
  let comparisonIndex = 0;

  tokens.forEach((token) => {
    if (token.type === 'removed') {
      if (baseIndex < baseMetadata.length) {
        const meta = baseMetadata[baseIndex];
        if (meta?.bbox) {
          const entry = baseHighlights.get(meta.page) ?? [];
          entry.push(meta.bbox);
          baseHighlights.set(meta.page, entry);
        }
      }
      baseIndex += 1;
      return;
    }

    if (token.type === 'added') {
      if (comparisonIndex < comparisonMetadata.length) {
        const meta = comparisonMetadata[comparisonIndex];
        if (meta?.bbox) {
          const entry = comparisonHighlights.get(meta.page) ?? [];
          entry.push(meta.bbox);
          comparisonHighlights.set(meta.page, entry);
        }
      }
      comparisonIndex += 1;
      return;
    }

    if (baseIndex < baseMetadata.length) {
      baseIndex += 1;
    }
    if (comparisonIndex < comparisonMetadata.length) {
      comparisonIndex += 1;
    }
  });

  // Merge overlapping/adjacent rectangles to avoid overpainting
  const mergeRects = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
    if (rects.length === 0) return rects;
    const EPS_X = 0.004; // ~0.4% width tolerance
    const EPS_Y = 0.006; // vertical tolerance to treat as same line
    const sorted = rects.slice().sort((r1, r2) => (r1.top !== r2.top ? r1.top - r2.top : r1.left - r2.left));
    const merged: TokenBoundingBox[] = [];
    for (const r of sorted) {
      const last = merged[merged.length - 1];
      if (
        last && Math.abs(r.top - last.top) < EPS_Y &&
        r.left <= last.left + last.width + EPS_X &&
        r.top + r.height >= last.top - EPS_Y && last.top + last.height >= r.top - EPS_Y
      ) {
        const left = Math.min(last.left, r.left);
        const right = Math.max(last.left + last.width, r.left + r.width);
        const top = Math.min(last.top, r.top);
        const bottom = Math.max(last.top + last.height, r.top + r.height);
        last.left = left;
        last.top = top;
        last.width = Math.max(0, right - left);
        last.height = Math.max(0, bottom - top);
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  };

  for (const [page, rects] of baseHighlights) {
    baseHighlights.set(page, mergeRects(rects));
  }
  for (const [page, rects] of comparisonHighlights) {
    comparisonHighlights.set(page, mergeRects(rects));
  }

  return { base: baseHighlights, comparison: comparisonHighlights };
};

const renderPdfDocumentToImages = async (file: File): Promise<PagePreview[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
    disableAutoFetch: true,
    disableStream: true,
  });

  try {
    const previews: PagePreview[] = [];
    const scale = 1.25;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (!context) {
        page.cleanup();
        continue;
      }

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      previews.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        url: canvas.toDataURL(),
      });

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    return previews;
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
};

const CompareWorkbenchView = ({ data }: CompareWorkbenchViewProps) => {
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const { actions: fileActions } = useFileActions();
  const { selectors } = useFileContext();
  const [mode, setMode] = useState<ViewMode>('diff');
  const prefersStacked = useMediaQuery('(max-width: 1024px)');
  const [layout, setLayout] = useState<'side-by-side' | 'stacked'>(prefersStacked ? 'stacked' : 'side-by-side');

  const [basePages, setBasePages] = useState<PagePreview[]>([]);
  const [comparisonPages, setComparisonPages] = useState<PagePreview[]>([]);
  const [baseLoading, setBaseLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const baseScrollRef = useRef<HTMLDivElement>(null);
  const comparisonScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const [isScrollLinked, setIsScrollLinked] = useState(true);
  // Maintain normalized deltas so panes keep their relative positions when re-linked
  const scrollLinkDeltaRef = useRef<{ vertical: number; horizontal: number }>({ vertical: 0, horizontal: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const panDragRef = useRef<{ active: boolean; source: 'base' | 'comparison' | null; startX: number; startY: number; startScrollLeft: number; startScrollTop: number; targetStartScrollLeft: number; targetStartScrollTop: number }>({ active: false, source: null, startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0, targetStartScrollLeft: 0, targetStartScrollTop: 0 });
  const lastActivePaneRef = useRef<'base' | 'comparison'>('base');
  const [baseZoom, setBaseZoom] = useState(1);
  const [comparisonZoom, setComparisonZoom] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.1;
  const wheelZoomAccumRef = useRef<{ base: number; comparison: number }>({ base: 0, comparison: 0 });
  const pinchRef = useRef<{ active: boolean; pane: 'base' | 'comparison' | null; startDistance: number; startZoom: number }>(
    { active: false, pane: null, startDistance: 0, startZoom: 1 }
  );

  const result = data?.result ?? null;
  const baseFileId = data?.baseFileId ?? null;
  const comparisonFileId = data?.comparisonFileId ?? null;
  const onSelectBase = data?.onSelectBase;
  const onSelectComparison = data?.onSelectComparison;
  const isOperationLoading = data?.isLoading ?? false;

  const baseOpenRef = useRef<(() => void) | null>(null);
  const comparisonOpenRef = useRef<(() => void) | null>(null);

  const baseFile = data?.baseLocalFile ?? (baseFileId ? selectors.getFile(baseFileId) ?? null : null);
  const comparisonFile = data?.comparisonLocalFile ?? (comparisonFileId ? selectors.getFile(comparisonFileId) ?? null : null);
  const baseStub = baseFileId ? selectors.getStirlingFileStub(baseFileId) ?? null : null;
  const comparisonStub = comparisonFileId ? selectors.getStirlingFileStub(comparisonFileId) ?? null : null;

  const handleFilesAdded = useCallback(
    async (files: File[], role: 'base' | 'comparison') => {
      if (!files.length || isOperationLoading) {
        return;
      }
      try {
        const added = await fileActions.addFiles(files, { selectFiles: true });
        const primary = added[0];
        if (!primary) {
          return;
        }
        if (role === 'base') {
          onSelectBase?.(primary.fileId as FileId);
        } else {
          onSelectComparison?.(primary.fileId as FileId);
        }
      } catch (error) {
        console.error('[compare] failed to add files from workbench dropzone', error);
      }
    },
    [fileActions, isOperationLoading, onSelectBase, onSelectComparison]
  );
  // Toggle layout via Right Rail
  const toggleLayout = useCallback(() => {
    setLayout(prev => (prev === 'side-by-side' ? 'stacked' : 'side-by-side'));
  }, []);

  // Default to stacked on mobile and when screen shrinks; return to side-by-side when expanded
  useEffect(() => {
    setLayout(prev => (prefersStacked ? 'stacked' : prev === 'stacked' ? 'side-by-side' : prev));
  }, [prefersStacked]);

  const rightRailButtons = useMemo(() => [
    {
      id: 'compare-toggle-layout',
      icon: <LocalIcon icon={layout === 'side-by-side' ? 'vertical-split-rounded' : 'horizontal-split-rounded'} width="1.5rem" height="1.5rem" />,
      tooltip: layout === 'side-by-side' ? t('compare.actions.stackVertically', 'Stack vertically') : t('compare.actions.placeSideBySide', 'Place side by side'),
      ariaLabel: layout === 'side-by-side' ? t('compare.actions.stackVertically', 'Stack vertically') : t('compare.actions.placeSideBySide', 'Place side by side'),
      section: 'top' as const,
      order: 10,
      onClick: toggleLayout,
    },
    {
      id: 'compare-pan-mode',
      section: 'top' as const,
      order: 12,
      render: ({ disabled }: { disabled: boolean }) => (
        <Tooltip content={t('rightRail.panMode', 'Pan Mode')} position="left" offset={12} arrow portalTarget={document.body}>
          <ActionIcon
            variant={isPanMode ? 'default' : 'subtle'}
            color={undefined}
            radius="md"
            className="right-rail-icon"
            onClick={() => setIsPanMode(prev => !prev)}
            disabled={disabled}
            aria-label={t('rightRail.panMode', 'Pan Mode')}
            style={isPanMode ? { backgroundColor: 'var(--right-rail-pan-active-bg)' } : undefined}
          >
            <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />
          </ActionIcon>
        </Tooltip>
      ),
    },
    {
      id: 'compare-zoom-out',
      icon: <LocalIcon icon="zoom-out" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.zoomOut', 'Zoom out'),
      ariaLabel: t('compare.actions.zoomOut', 'Zoom out'),
      section: 'top' as const,
      order: 13,
      onClick: () => {
        // Zoom always applies to both panes, regardless of link state
        setBaseZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
        setComparisonZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
      },
    },
    {
      id: 'compare-zoom-in',
      icon: <LocalIcon icon="zoom-in" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.zoomIn', 'Zoom in'),
      ariaLabel: t('compare.actions.zoomIn', 'Zoom in'),
      section: 'top' as const,
      order: 14,
      onClick: () => {
        // Zoom always applies to both panes, regardless of link state
        setBaseZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
        setComparisonZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
      },
    },
    {
      id: 'compare-reset-view',
      icon: <LocalIcon icon="refresh-rounded" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.resetView', 'Reset zoom and pan'),
      ariaLabel: t('compare.actions.resetView', 'Reset zoom and pan'),
      section: 'top' as const,
      order: 14.5,
      onClick: () => {
        // Reset zoom on both panes; keep current scroll positions unchanged
        setBaseZoom(1);
        setComparisonZoom(1);
        // Clear any stored link delta; next link will recompute from current scrolls
        scrollLinkDeltaRef.current = { vertical: 0, horizontal: 0 };
      },
    },
    {
      id: 'compare-toggle-scroll-link',
      icon: <LocalIcon icon={isScrollLinked ? 'link-rounded' : 'link-off-rounded'} width="1.5rem" height="1.5rem" />,
      tooltip: isScrollLinked ? t('compare.actions.unlinkScrollPan', 'Unlink scroll and pan') : t('compare.actions.linkScrollPan', 'Link scroll and pan'),
      ariaLabel: isScrollLinked ? t('compare.actions.unlinkScrollPan', 'Unlink scroll and pan') : t('compare.actions.linkScrollPan', 'Link scroll and pan'),
      section: 'top' as const,
      order: 15,
      onClick: () => {
        // Toggling from unlinked -> linked: compute current normalized delta so we preserve ratio
        const next = !isScrollLinked;
        if (next) {
          const baseEl = baseScrollRef.current;
          const compEl = comparisonScrollRef.current;
          if (baseEl && compEl) {
            const baseVMax = Math.max(1, baseEl.scrollHeight - baseEl.clientHeight);
            const compVMax = Math.max(1, compEl.scrollHeight - compEl.clientHeight);
            const baseHMax = Math.max(1, baseEl.scrollWidth - baseEl.clientWidth);
            const compHMax = Math.max(1, compEl.scrollWidth - compEl.clientWidth);

            const baseV = baseEl.scrollTop / baseVMax;
            const compV = compEl.scrollTop / compVMax;
            const baseH = baseEl.scrollLeft / baseHMax;
            const compH = compEl.scrollLeft / compHMax;

            scrollLinkDeltaRef.current = {
              vertical: compV - baseV,
              horizontal: compH - baseH,
            };
          }
        }
        if (!next) {
          alert({
            alertType: 'neutral',
            title: t('compare.toasts.unlinkedTitle', 'Independent scroll & pan enabled'),
            body: t('compare.toasts.unlinkedBody', 'Tip: Arrow Up/Down scroll both panes; panning only moves the active pane.'),
            durationMs: 5000,
            location: 'bottom-center' as ToastLocation,
            expandable: false,
          });
        }
        setIsScrollLinked(next);
      },
    },
  ], [layout, t, toggleLayout, isScrollLinked, isPanMode]);

  useRightRailButtons(rightRailButtons);

  // Removed pane measurement; rely on CSS width:100% for responsive fit


  const handleSelectFromLibrary = useCallback(
    (role: 'base' | 'comparison') => {
      if (isOperationLoading) {
        return;
      }
      openFilesModal({
        customHandler: async (files: File[]) => {
          await handleFilesAdded(files, role);
        },
      });
    },
    [handleFilesAdded, isOperationLoading, openFilesModal]
  );

  const handleClearSelection = useCallback(
    (role: 'base' | 'comparison') => {
      if (isOperationLoading) {
        return;
      }
      if (role === 'base') {
        onSelectBase?.(null);
      } else {
        onSelectComparison?.(null);
      }
    },
    [isOperationLoading, onSelectBase, onSelectComparison]
  );

  const formatFileSize = (size?: number) => {
    if (!size || Number.isNaN(size)) {
      return '';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const renderUploadColumn = useCallback(
    (
      role: 'base' | 'comparison',
      {
        openRef,
        file,
        stub,
        title,
        description,
        accentClass,
      }: {
        openRef: MutableRefObject<(() => void) | null>;
        file: File | null;
        stub: StirlingFileStub | null;
        title: string;
        description: string;
        accentClass: string;
      }
    ) => {
      const fileName = stub?.name ?? file?.name ?? null;
      const fileSize = stub?.size ?? file?.size ?? null;
      const fileLabel = fileName ? `${fileName}${fileSize ? ` • ${formatFileSize(fileSize)}` : ''}` : null;

      const handleDrop = (dropped: File[]) => handleFilesAdded(dropped, role);
      const handleUploadClick = () => openRef.current?.();
      const handleLibraryClick = () => handleSelectFromLibrary(role);
      const handleClearClick = () => handleClearSelection(role);

      return (
        <div className="compare-upload-column" key={`upload-column-${role}`}>
          <Dropzone
            openRef={((instance: (() => void | undefined) | null) => {
              openRef.current = instance ?? null;
            }) as ForwardedRef<() => void | undefined>}
            onDrop={handleDrop}
            disabled={isOperationLoading}
            multiple
            className="compare-upload-dropzone"
          >
            <div className="compare-upload-card">
              <div className={`compare-upload-icon ${accentClass}`}>
                <LocalIcon icon="upload" width="2.5rem" height="2.5rem" />
              </div>
              <Text fw={600} size="lg">
                {title}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {description}
              </Text>

              <div className="compare-upload-actions">
                <Button
                  onClick={handleUploadClick}
                  disabled={isOperationLoading}
                  fullWidth
                >
                  {t('compare.upload.browse', 'Browse files')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLibraryClick}
                  disabled={isOperationLoading}
                  fullWidth
                >
                  {t('compare.upload.selectExisting', 'Select existing')}
                </Button>
              </div>

              {fileLabel ? (
                <div className="compare-upload-selection">
                  <Text size="sm" fw={500} lineClamp={2}>
                    {fileLabel}
                  </Text>
                  <Button
                    variant="subtle"
                    color="gray"
                    onClick={handleClearClick}
                    disabled={isOperationLoading}
                    size="xs"
                  >
                    {t('compare.upload.clearSelection', 'Clear selection')}
                  </Button>
                </div>
              ) : (
                <Text size="xs" c="dimmed" ta="center">
                  {t('compare.upload.instructions', 'Drag & drop here or use the buttons to choose a file.')}
                </Text>
              )}
            </div>
          </Dropzone>
        </div>
      );
    },
    [handleClearSelection, handleFilesAdded, handleSelectFromLibrary, isOperationLoading, t]
  );

  const renderUploadLayout = () => (
    <Stack className="compare-workbench compare-workbench--upload" gap="lg">
      <Stack gap={4} align="center">
        <Text fw={600} size="lg">
          {t('compare.upload.title', 'Set up your comparison')}
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={520}>
          {t(
            'compare.upload.subtitle',
            'Add a base document on the left and a comparison document on the right to highlight their differences.'
          )}
        </Text>
      </Stack>
      <div className="compare-upload-layout">
        {renderUploadColumn('base', {
          openRef: baseOpenRef,
          file: baseFile,
          stub: baseStub,
          title: t('compare.upload.baseTitle', 'Base document'),
          description: t('compare.upload.baseDescription', 'This version acts as the reference for differences.'),
          accentClass: 'compare-upload-icon--base',
        })}
        <div className="compare-upload-divider" aria-hidden="true" />
        {renderUploadColumn('comparison', {
          openRef: comparisonOpenRef,
          file: comparisonFile,
          stub: comparisonStub,
          title: t('compare.upload.comparisonTitle', 'Comparison document'),
          description: t('compare.upload.comparisonDescription', 'Differences from this version will be highlighted.'),
          accentClass: 'compare-upload-icon--comparison',
        })}
      </div>
    </Stack>
  );

  useEffect(() => {
    setMode('diff');
  }, [result?.totals.processedAt, data?.baseFileId, data?.comparisonFileId]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!baseFile || !result) {
        setBasePages([]);
        return;
      }
      setBaseLoading(true);
      try {
        const previews = await renderPdfDocumentToImages(baseFile);
        if (!cancelled) {
          setBasePages(previews);
        }
      } catch (error) {
        console.error('[compare] failed to render base document preview', error);
        if (!cancelled) {
          setBasePages([]);
        }
      } finally {
        if (!cancelled) {
          setBaseLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [baseFile, result?.totals.processedAt]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!comparisonFile || !result) {
        setComparisonPages([]);
        return;
      }
      setComparisonLoading(true);
      try {
        const previews = await renderPdfDocumentToImages(comparisonFile);
        if (!cancelled) {
          setComparisonPages(previews);
        }
      } catch (error) {
        console.error('[compare] failed to render comparison document preview', error);
        if (!cancelled) {
          setComparisonPages([]);
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [comparisonFile, result?.totals.processedAt]);

  const totals = result?.totals ?? {
    added: 0,
    removed: 0,
    unchanged: 0,
    durationMs: 0,
    processedAt: Date.now(),
  };

  const highlightMaps = useMemo(() => {
    if (!result) {
      return { base: new Map(), comparison: new Map() };
    }
    // Build per-page rectangles directly from the token stream we used for summary
    const baseMap: HighlightMap = new Map();
    const comparisonMap: HighlightMap = new Map();
    // Precompute rects for each page using token metadata
    const byPageBase: Map<number, TokenBoundingBox[]> = new Map();
    const byPageComparison: Map<number, TokenBoundingBox[]> = new Map();

    let baseIndex = 0;
    let comparisonIndex = 0;
    for (const token of result.tokens) {
      if (token.type === 'removed') {
        const meta = result.tokenMetadata.base[baseIndex];
        if (meta?.bbox) {
          const arr = byPageBase.get(meta.page) ?? [];
          arr.push(meta.bbox);
          byPageBase.set(meta.page, arr);
        }
        baseIndex += 1;
      } else if (token.type === 'added') {
        const meta = result.tokenMetadata.comparison[comparisonIndex];
        if (meta?.bbox) {
          const arr = byPageComparison.get(meta.page) ?? [];
          arr.push(meta.bbox);
          byPageComparison.set(meta.page, arr);
        }
        comparisonIndex += 1;
      } else {
        baseIndex += 1;
        comparisonIndex += 1;
      }
    }

    const toMerged = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
      const EPS_X = 0.02; // merge gaps up to ~2% of page width
      const EPS_Y = 0.006;
      const sorted = rects.slice().sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
      const merged: TokenBoundingBox[] = [];
      for (const r of sorted) {
        const last = merged[merged.length - 1];
        if (
          last && Math.abs(r.top - last.top) < EPS_Y && r.left <= last.left + last.width + EPS_X
        ) {
          const left = Math.min(last.left, r.left);
          const right = Math.max(last.left + last.width, r.left + r.width);
          last.left = left;
          last.width = Math.max(0, right - left);
          last.top = Math.min(last.top, r.top);
          last.height = Math.max(last.height, r.height);
        } else {
          merged.push({ ...r });
        }
      }
      return merged;
    };

    for (const [page, rects] of byPageBase) baseMap.set(page, toMerged(rects));
    for (const [page, rects] of byPageComparison) comparisonMap.set(page, toMerged(rects));

    return { base: baseMap, comparison: comparisonMap };
  }, [result]);

  const handleScrollSync = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    // Do not sync while panning; panning should only affect the active pane
    if (panDragRef.current.active) return;
    if (!source || !target || isSyncingRef.current || !isScrollLinked) {
      return;
    }

    // Track last interacted pane for targeted zoom when unlinked
    lastActivePaneRef.current = source === baseScrollRef.current ? 'base' : 'comparison';

    const sourceIsBase = source === baseScrollRef.current;
    const deltaV = scrollLinkDeltaRef.current.vertical;
    const deltaH = scrollLinkDeltaRef.current.horizontal;

    // Normalize positions (guard against zero scroll ranges)
    const sVMax = Math.max(1, source.scrollHeight - source.clientHeight);
    const sHMax = Math.max(1, source.scrollWidth - source.clientWidth);
    const tVMax = Math.max(1, target.scrollHeight - target.clientHeight);
    const tHMax = Math.max(1, target.scrollWidth - target.clientWidth);

    const sV = source.scrollTop / sVMax;
    const sH = source.scrollLeft / sHMax;

    // If base is source, comp = base + delta; if comp is source, base = comp - delta
    const desiredTV = sourceIsBase ? sV + deltaV : sV - deltaV;
    const desiredTH = sourceIsBase ? sH + deltaH : sH - deltaH;

    const clampedTV = Math.max(0, Math.min(1, desiredTV));
    const clampedTH = Math.max(0, Math.min(1, desiredTH));

    isSyncingRef.current = true;
    target.scrollTop = clampedTV * tVMax;
    target.scrollLeft = clampedTH * tHMax;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const beginPan = (pane: 'base' | 'comparison', e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanMode) return;
    // Only enable panning when zoomed beyond 1 (i.e., content larger than viewport)
    if (pane === 'base' ? baseZoom <= 1 : comparisonZoom <= 1) return;
    const container = pane === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    const other = pane === 'base' ? comparisonScrollRef.current : baseScrollRef.current;
    if (!container) return;
    e.preventDefault();
    panDragRef.current = {
      active: true,
      source: pane,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      targetStartScrollLeft: other?.scrollLeft ?? 0,
      targetStartScrollTop: other?.scrollTop ?? 0,
    };
    lastActivePaneRef.current = pane;
    (container as HTMLDivElement).style.cursor = 'grabbing';
  };

  const continuePan = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanMode) return;
    const drag = panDragRef.current;
    if (!drag.active || !drag.source) return;

    const sourceEl = drag.source === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    const targetEl = drag.source === 'base' ? comparisonScrollRef.current : baseScrollRef.current;
    if (!sourceEl) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    isSyncingRef.current = true;
    sourceEl.scrollLeft = drag.startScrollLeft - dx;
    sourceEl.scrollTop = drag.startScrollTop - dy;

    // If linked, pan the other pane proportionally; else only pan the active pane
    if (isScrollLinked && targetEl) {
      const sHMax = Math.max(1, sourceEl.scrollWidth - sourceEl.clientWidth);
      const tHMax = Math.max(1, targetEl.scrollWidth - targetEl.clientWidth);
      const sVMax = Math.max(1, sourceEl.scrollHeight - sourceEl.clientHeight);
      const tVMax = Math.max(1, targetEl.scrollHeight - targetEl.clientHeight);

      const scaledDx = dx * (tHMax / sHMax);
      const scaledDy = dy * (tVMax / sVMax);

      targetEl.scrollLeft = panDragRef.current.targetStartScrollLeft - scaledDx;
      targetEl.scrollTop = panDragRef.current.targetStartScrollTop - scaledDy;
    }

    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const endPan = () => {
    const drag = panDragRef.current;
    if (!drag.active) return;
    const sourceEl = drag.source === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    if (sourceEl) {
      (sourceEl as HTMLDivElement).style.cursor = isPanMode ? (drag.source === 'base' ? (baseZoom > 1 ? 'grab' : 'auto') : (comparisonZoom > 1 ? 'grab' : 'auto')) : '';
    }
    panDragRef.current.active = false;
    panDragRef.current.source = null;
  };

  // Wheel pinch-to-zoom (trackpad): ctrlKey is true during pinch on most browsers
  const handleWheelZoom = (pane: 'base' | 'comparison', e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return; // Only treat as pinch-zoom if ctrlKey (prevents accidental zoom)
    e.preventDefault();
    const key = pane === 'base' ? 'base' : 'comparison';
    const accum = wheelZoomAccumRef.current;
    const threshold = 180; // Larger threshold => less sensitive
    accum[key] += e.deltaY;
    const steps = Math.trunc(Math.abs(accum[key]) / threshold);
    if (steps <= 0) return;
    const dir = accum[key] > 0 ? -1 : 1; // deltaY>0 => zoom out
    accum[key] = accum[key] % threshold;
    const applySteps = (z: number) => {
      let next = z;
      for (let i = 0; i < steps; i += 1) {
        next = dir > 0 ? Math.min(ZOOM_MAX, +(next + ZOOM_STEP).toFixed(2)) : Math.max(ZOOM_MIN, +(next - ZOOM_STEP).toFixed(2));
      }
      return next;
    };
    if (pane === 'base') {
      setBaseZoom(applySteps);
    } else {
      setComparisonZoom(applySteps);
    }
  };

  // Touch pinch-to-zoom on mobile
  const onTouchStart = (pane: 'base' | 'comparison', e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      pinchRef.current = {
        active: true,
        pane,
        startDistance: Math.hypot(dx, dy),
        startZoom: pane === 'base' ? baseZoom : comparisonZoom,
      };
      e.preventDefault();
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pinchRef.current.active || e.touches.length !== 2) return;
    const [t1, t2] = [e.touches[0], e.touches[1]];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    const distance = Math.hypot(dx, dy);
    const scale = distance / Math.max(1, pinchRef.current.startDistance);
    // Dampen sensitivity
    const dampened = 1 + (scale - 1) * 0.6;
    const pane = pinchRef.current.pane!;
    const startZoom = pinchRef.current.startZoom;
    const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(startZoom * dampened).toFixed(2)));
    if (pane === 'base') setBaseZoom(nextZoom); else setComparisonZoom(nextZoom);
    e.preventDefault();
  };

  const onTouchEnd = () => {
    pinchRef.current.active = false;
    pinchRef.current.pane = null;
  };

  // Keyboard handler: when unlinked, ArrowUp/Down scroll both panes in the same direction
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isScrollLinked) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      const isEditable = target && (tag === 'input' || tag === 'textarea' || (target.getAttribute('contenteditable') === 'true'));
      if (isEditable) return;

      const baseEl = baseScrollRef.current;
      const compEl = comparisonScrollRef.current;
      if (!baseEl || !compEl) return;

      const STEP = 80; // pixels per key press

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? STEP : -STEP;
        isSyncingRef.current = true;
        baseEl.scrollTop = Math.max(0, Math.min(baseEl.scrollTop + delta, baseEl.scrollHeight - baseEl.clientHeight));
        compEl.scrollTop = Math.max(0, Math.min(compEl.scrollTop + delta, compEl.scrollHeight - compEl.clientHeight));
        requestAnimationFrame(() => {
          isSyncingRef.current = false;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isScrollLinked]);

  // Group tokens into sentences for better UX
  const groupTokensBySentence = useCallback((tokens: CompareDiffToken[], metadata: CompareTokenMetadata[]) => {
    const sentences: Array<{
      tokens: CompareDiffToken[];
      metadata: CompareTokenMetadata[];
      pageNumber: number;
      startIndex: number;
    }> = [];

    let currentSentence: CompareDiffToken[] = [];
    let currentMetadata: CompareTokenMetadata[] = [];
    let currentPage = -1;
    let startIndex = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const meta = metadata[i];

      if (token.type === 'unchanged') continue;

      // Check if this starts a new sentence (ends with punctuation or is a new page)
      const isNewSentence = currentSentence.length > 0 && (
        token.text.match(/[.!?]\s*$/) || // Ends with sentence-ending punctuation
        token.text.match(/^\s*[A-Z][a-z]/) || // Starts with capital letter followed by lowercase (likely new sentence)
        meta?.page !== currentPage
      );

      if (isNewSentence) {
        if (currentSentence.length > 0) {
          sentences.push({
            tokens: [...currentSentence],
            metadata: [...currentMetadata],
            pageNumber: currentPage,
            startIndex,
          });
        }
        currentSentence = [token];
        currentMetadata = [meta];
        currentPage = meta?.page || currentPage;
        startIndex = i;
      } else {
        currentSentence.push(token);
        if (meta) currentMetadata.push(meta);
        if (meta?.page && currentPage === -1) currentPage = meta.page;
      }
    }

    // Add remaining sentence
    if (currentSentence.length > 0) {
      sentences.push({
        tokens: currentSentence,
        metadata: currentMetadata,
        pageNumber: currentPage,
        startIndex,
      });
    }

    return sentences;
  }, []);

  // Create a mapping from token index to sentence group
  const createTokenToSentenceMap = useCallback((tokens: CompareDiffToken[], isBase: boolean) => {
    const sentenceGroups = groupTokensBySentence(
      tokens,
      isBase ? result!.tokenMetadata.base : result!.tokenMetadata.comparison
    );

    const tokenToSentenceMap = new Map<number, number>();
    const sentenceToTokensMap = new Map<number, number[]>();

    sentenceGroups.forEach((group, groupIndex) => {
      const relevantTokens = group.tokens.filter(t => isBase ? t.type === 'removed' : t.type === 'added');
      sentenceToTokensMap.set(groupIndex, relevantTokens.map((_, tokenIndex) =>
        tokens.indexOf(relevantTokens[tokenIndex])
      ));

      relevantTokens.forEach((token, tokenIndex) => {
        const originalIndex = tokens.indexOf(token);
        tokenToSentenceMap.set(originalIndex, groupIndex);
      });
    });

    return { sentenceGroups, tokenToSentenceMap, sentenceToTokensMap };
  }, [groupTokensBySentence, result]);

  // Build per-word change items with stable IDs that map 1:1 to highlight elements
  const baseTokenIndexToGroupId = useMemo(() => new Map<number, string>(), []);
  const baseWordChanges = useMemo(() => {
    baseTokenIndexToGroupId.clear();
    if (!result) return [] as Array<{ value: string; label: string; pageNumber: number }>;
    const items: Array<{ value: string; label: string; pageNumber: number }> = [];
    let baseIndex = 0;
    for (let i = 0; i < result.tokens.length; i += 1) {
      const token = result.tokens[i];
      if (token.type === 'removed') {
        const startIndex = baseIndex;
        const parts: string[] = [];
        let pageNumber = result.tokenMetadata.base[baseIndex]?.page ?? 1;
        // accumulate contiguous removed tokens
        while (i < result.tokens.length && result.tokens[i].type === 'removed') {
          parts.push(result.tokens[i].text);
          baseTokenIndexToGroupId.set(baseIndex, `base-group-${startIndex}-${baseIndex}`);
          baseIndex += 1;
          i += 1;
        }
        // step back one because for-loop will ++
        i -= 1;
        const endIndex = baseIndex - 1;
        const label = parts.join(' ').trim();
        items.push({ value: `base-group-${startIndex}-${endIndex}`, label: label || '(…)', pageNumber });
        continue;
      }
      if (token.type !== 'added') {
        baseIndex += 1;
      }
    }
    return items;
  }, [result, baseTokenIndexToGroupId]);

  const comparisonTokenIndexToGroupId = useMemo(() => new Map<number, string>(), []);
  const comparisonWordChanges = useMemo(() => {
    comparisonTokenIndexToGroupId.clear();
    if (!result) return [] as Array<{ value: string; label: string; pageNumber: number }>;
    const items: Array<{ value: string; label: string; pageNumber: number }> = [];
    let comparisonIndex = 0;
    for (let i = 0; i < result.tokens.length; i += 1) {
      const token = result.tokens[i];
      if (token.type === 'added') {
        const startIndex = comparisonIndex;
        const parts: string[] = [];
        let pageNumber = result.tokenMetadata.comparison[comparisonIndex]?.page ?? 1;
        while (i < result.tokens.length && result.tokens[i].type === 'added') {
          parts.push(result.tokens[i].text);
          comparisonTokenIndexToGroupId.set(comparisonIndex, `comparison-group-${startIndex}-${comparisonIndex}`);
          comparisonIndex += 1;
          i += 1;
        }
        i -= 1;
        const endIndex = comparisonIndex - 1;
        const label = parts.join(' ').trim();
        items.push({ value: `comparison-group-${startIndex}-${endIndex}`, label: label || '(…)', pageNumber });
        continue;
      }
      if (token.type !== 'removed') {
        comparisonIndex += 1;
      }
    }
    return items;
  }, [result, comparisonTokenIndexToGroupId]);

  // Precompute word highlight rects by page with their token indices (no merging)
  const wordHighlightMaps = useMemo(() => {
    if (!result) return { base: new Map<number, { rect: TokenBoundingBox; index: number }[]>(), comparison: new Map<number, { rect: TokenBoundingBox; index: number }[]>() };
    const baseMap = new Map<number, { rect: TokenBoundingBox; index: number }[]>();
    const comparisonMap = new Map<number, { rect: TokenBoundingBox; index: number }[]>();

    let baseIndex = 0;
    let comparisonIndex = 0;
    for (const token of result.tokens) {
      if (token.type === 'removed') {
        const meta = result.tokenMetadata.base[baseIndex];
        if (meta?.bbox) {
          const list = baseMap.get(meta.page) ?? [];
          list.push({ rect: meta.bbox, index: baseIndex });
          baseMap.set(meta.page, list);
        }
        baseIndex += 1;
      } else if (token.type === 'added') {
        const meta = result.tokenMetadata.comparison[comparisonIndex];
        if (meta?.bbox) {
          const list = comparisonMap.get(meta.page) ?? [];
          list.push({ rect: meta.bbox, index: comparisonIndex });
          comparisonMap.set(meta.page, list);
        }
        comparisonIndex += 1;
      } else {
        baseIndex += 1;
        comparisonIndex += 1;
      }
    }

    return { base: baseMap, comparison: comparisonMap };
  }, [result]);

  // Compute a consistent per-row height so that page N in base aligns with page N in comparison
  const getRowHeightPx = useCallback((pageNumber: number) => {
    const basePage = basePages.find(p => p.pageNumber === pageNumber);
    const compPage = comparisonPages.find(p => p.pageNumber === pageNumber);
    const baseHeight = basePage ? basePage.height * baseZoom : 0;
    const compHeight = compPage ? compPage.height * comparisonZoom : 0;
    const rowHeight = Math.max(baseHeight, compHeight);
    return Math.round(rowHeight);
  }, [basePages, comparisonPages, baseZoom, comparisonZoom]);

  const handleChangeNavigation = useCallback((changeValue: string, pane: 'base' | 'comparison') => {
    const targetRef = pane === 'base' ? baseScrollRef : comparisonScrollRef;
    const container = targetRef.current;
    if (!container) {
      return;
    }
    // Select ALL highlight boxes for the group id
    const nodes = Array.from(container.querySelectorAll(`[data-change-id="${changeValue}"]`)) as HTMLElement[];
    if (nodes.length > 0) {
      const containerRect = container.getBoundingClientRect();
      // Compute union bounding box of all nodes to center scroll
      let minTop = Number.POSITIVE_INFINITY;
      let minLeft = Number.POSITIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;
      nodes.forEach((el) => {
        const r = el.getBoundingClientRect();
        minTop = Math.min(minTop, r.top);
        minLeft = Math.min(minLeft, r.left);
        maxBottom = Math.max(maxBottom, r.bottom);
        maxRight = Math.max(maxRight, r.right);
      });
      const boxHeight = Math.max(1, maxBottom - minTop);
      const boxWidth = Math.max(1, maxRight - minLeft);
      const absoluteTop = minTop - containerRect.top + container.scrollTop;
      const absoluteLeft = minLeft - containerRect.left + container.scrollLeft;
      const desiredTop = Math.max(0, absoluteTop - (container.clientHeight - boxHeight) / 2);
      const desiredLeft = Math.max(0, absoluteLeft - (container.clientWidth - boxWidth) / 2);

      container.scrollTo({ top: desiredTop, left: desiredLeft, behavior: 'smooth' });

      // Retrigger flash for EVERY node in the group
      nodes.forEach((el) => {
        el.classList.remove('compare-diff-highlight--flash');
      });
      // Force reflow to restart animation
      void container.clientWidth;
      nodes.forEach((el) => {
        el.classList.add('compare-diff-highlight--flash');
        window.setTimeout(() => el.classList.remove('compare-diff-highlight--flash'), 1600);
      });
      return;
    }
  }, []);

  // Custom navigation dropdown component
  const NavigationDropdown = ({
    changes,
    placeholder,
    className,
    onNavigate,
  }: {
    changes: Array<{ value: string; label: string; pageNumber: number }>;
    placeholder: string;
    className?: string;
    onNavigate: (value: string) => void;
  }) => {
    const combobox = useCombobox({
      onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const options = changes.map((item) => (
      <Combobox.Option
        value={item.value}
        key={item.value}
        onClick={() => {
          console.log('Dropdown option clicked:', item.value);
          onNavigate(item.value);
          combobox.closeDropdown();
        }}
      >
        <span style={{ fontSize: '0.875rem' }}>{item.label}</span>
      </Combobox.Option>
    ));

    return (
      <Combobox
        store={combobox}
        withinPortal={false}
        onOptionSubmit={(val) => {
          console.log('Dropdown option submitted:', val);
          onNavigate(val);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <div
            className={`compare-changes-select ${className || ''}`}
            style={{
              cursor: 'pointer',
              minWidth: '200px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onClick={() => combobox.toggleDropdown()}
          >
            <span>{placeholder}</span>
            <Combobox.Chevron style={{ marginLeft: '8px' }} />
          </div>
        </Combobox.Target>

        <Combobox.Dropdown>
          <ScrollArea.Autosize mah={300}>
            <Combobox.Search placeholder="Search changes..." />
            <Combobox.Options>
              {options.length > 0 ? options : <Combobox.Empty>No changes found</Combobox.Empty>}
            </Combobox.Options>
          </ScrollArea.Autosize>
        </Combobox.Dropdown>
      </Combobox>
    );
  };

  // Drag-to-pan: adjust scroll positions directly for smooth, synced panning
  // No pan/zoom handlers in simplified mode

  if (!result) {
    return renderUploadLayout();
  }

  return (
    <Stack className="compare-workbench" style={{ height: '100%', minHeight: 0 }}>
      {result.warnings.length > 0 && (
        <Alert color="yellow" variant="light">
          <Stack gap={4}>
            {result.warnings.map((warning, index) => (
              <Text key={`warning-${index}`} size="sm">
                {warning}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Diff view only */}
        <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
          <Group gap="md" className="compare-legend">
            <div className="compare-legend__item">
              <span className="compare-legend__swatch" style={{ backgroundColor: toRgba(result.base.highlightColor, 0.35) }} />
              <Text size="xs">{t('compare.legend.removed', 'Removed from base')}</Text>
            </div>
            <div className="compare-legend__item">
              <span
                className="compare-legend__swatch"
                style={{ backgroundColor: toRgba(result.comparison.highlightColor, 0.35) }}
              />
              <Text size="xs">{t('compare.legend.added', 'Added in comparison')}</Text>
            </div>
          </Group>

          <div
            className={`compare-workbench__columns ${layout === 'stacked' ? 'compare-workbench__columns--stacked' : ''}`}
            style={{
              minHeight: 0,
              height: '100%',
            }}
          >
            {/** Compute pane styles: in stacked mode, force each pane to exactly half height */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Sticky Header - Outside scroll container */}
              <div className="compare-header">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="lg">
                    {result.base.fileName} - {basePages.length} pages
                  </Text>
                    {baseWordChanges.length > 0 && (
                      <NavigationDropdown
                        changes={baseWordChanges}
                        placeholder={`Deletions (${baseWordChanges.length})`}
                        className=""
                        onNavigate={(value) => handleChangeNavigation(value, 'base')}
                      />
                    )}
                </Group>
              </div>
              
              {/* Scrollable content */}
              <div
                ref={baseScrollRef}
                onScroll={(event) => handleScrollSync(event.currentTarget, comparisonScrollRef.current)}
                onMouseDown={(e) => beginPan('base', e)}
                onMouseMove={continuePan}
                onMouseUp={endPan}
                onMouseLeave={endPan}
                onWheel={(e) => handleWheelZoom('base', e)}
                onTouchStart={(e) => onTouchStart('base', e)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ minHeight: 0, flex: 1, overflow: 'auto', cursor: isPanMode ? (baseZoom > 1 ? 'grab' : 'auto') : 'auto' }}
              >
                <Stack gap="sm" style={{ position: 'relative' }}>

                {baseLoading && (
                  <Group justify="center" gap="xs" py="md">
                    <Loader size="sm" />
                    <Text size="sm">{t('compare.status.processing', 'Analyzing differences...')}</Text>
                  </Group>
                )}

                {!baseLoading && basePages.length === 0 && (
                  <Alert color="gray" variant="light">
                    <Text size="sm">{t('compare.view.noData', 'Run a comparison to view the summary and diff.')}</Text>
                  </Alert>
                )}

                {basePages.map((page) => {
                  const highlights = highlightMaps.base.get(page.pageNumber) ?? [];
                  const vOffset = 4 / page.height; // ~2px downward adjustment
                  // Compute a per-row fit so both sides share the same (larger) height for this page number
                  const compPage = comparisonPages.find(p => p.pageNumber === page.pageNumber);
                  const targetHeight = compPage ? Math.max(page.height, compPage.height) : page.height;
                  const fit = targetHeight / page.height;
                  const rowHeightPx = getRowHeightPx(page.pageNumber);

                  return (
                    <div key={`base-page-${page.pageNumber}`} className="compare-diff-page" style={{ minHeight: `${rowHeightPx}px` }}>
                      <Text size="xs" fw={600} c="dimmed">
                        {t('compare.summary.baseHeading', 'Base document')} · {t('compare.summary.pageLabel', 'Page')} {page.pageNumber}
                      </Text>
                      <div className="compare-diff-page__canvas" style={{ width: `${Math.round(page.width * fit * baseZoom)}px`, maxWidth: '100%', overflow: 'visible' }}>
                        <div style={{ position: 'relative', width: '100%', aspectRatio: `${page.width} / ${page.height}` }}>
                          <img src={page.url} alt={t('compare.summary.baseHeading', 'Base document')} loading="lazy" style={{ width: '100%', height: '100%' }} />
                          {(() => {
                            // Render per-word highlights with stable IDs
                            const wordRects = wordHighlightMaps.base.get(page.pageNumber) ?? [];

                            // Group rects by change id, then merge contiguous rects on the same line
                            const byGroup = new Map<string, TokenBoundingBox[]>();
                            for (const { rect, index } of wordRects) {
                              const id = baseTokenIndexToGroupId.get(index) ?? `base-token-${index}`;
                              const arr = byGroup.get(id) ?? [];
                              arr.push(rect);
                              byGroup.set(id, arr);
                            }

                            const EPS_X = 0.02; // merge gaps up to ~2% of page width
                            const EPS_Y = 0.006; // consider same text line
                            const mergeSameLine = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
                              if (rects.length === 0) return rects;
                              const sorted = rects.slice().sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
                              const merged: TokenBoundingBox[] = [];
                              for (const r of sorted) {
                                const last = merged[merged.length - 1];
                                if (
                                  last && Math.abs(r.top - last.top) < EPS_Y && r.left <= last.left + last.width + EPS_X
                                ) {
                                  const left = Math.min(last.left, r.left);
                                  const right = Math.max(last.left + last.width, r.left + r.width);
                                  const top = Math.min(last.top, r.top);
                                  const bottom = Math.max(last.top + last.height, r.top + r.height);
                                  last.left = left;
                                  last.top = top;
                                  last.width = Math.max(0, right - left);
                                  last.height = Math.max(0, bottom - top);
                                } else {
                                  merged.push({ ...r });
                                }
                              }
                              return merged;
                            };

                            const spans: JSX.Element[] = [];
                            byGroup.forEach((rects, id) => {
                              const mergedRects = mergeSameLine(rects);
                              mergedRects.forEach((rect, mIndex) => {
                                spans.push(
                                  <span
                                    key={`base-highlight-${page.pageNumber}-${id}-${mIndex}`}
                                    data-change-id={id}
                                    className="compare-diff-highlight"
                                    style={{
                                      left: `${rect.left * 100}%`,
                                      top: `${(rect.top + vOffset) * 100}%`,
                                      width: `${rect.width * 100}%`,
                                      height: `${rect.height * 100}%`,
                                      backgroundColor: toRgba(REMOVAL_HIGHLIGHT, 0.45),
                                    }}
                                  />
                                );
                              });
                            });

                            return spans;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </Stack>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Sticky Header - Outside scroll container */}
              <div className="compare-header">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="lg">
                    {result.comparison.fileName} - {comparisonPages.length} pages
                  </Text>
                    {comparisonWordChanges.length > 0 && (
                      <NavigationDropdown
                        changes={comparisonWordChanges}
                        placeholder={`Additions (${comparisonWordChanges.length})`}
                        className="compare-changes-select--comparison"
                        onNavigate={(value) => handleChangeNavigation(value, 'comparison')}
                      />
                    )}
                </Group>
              </div>
              
              {/* Scrollable content */}
              <div
                ref={comparisonScrollRef}
                onScroll={(event) => handleScrollSync(event.currentTarget, baseScrollRef.current)}
                onMouseDown={(e) => beginPan('comparison', e)}
                onMouseMove={continuePan}
                onMouseUp={endPan}
                onMouseLeave={endPan}
                onWheel={(e) => handleWheelZoom('comparison', e)}
                onTouchStart={(e) => onTouchStart('comparison', e)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ minHeight: 0, flex: 1, overflow: 'auto', cursor: isPanMode ? 'grab' : 'auto' }}
              >
                <Stack gap="sm" style={{ position: 'relative' }}>

                {comparisonLoading && (
                  <Group justify="center" gap="xs" py="md">
                    <Loader size="sm" />
                    <Text size="sm">{t('compare.status.processing', 'Analyzing differences...')}</Text>
                  </Group>
                )}

                {!comparisonLoading && comparisonPages.length === 0 && (
                  <Alert color="gray" variant="light">
                    <Text size="sm">{t('compare.view.noData', 'Run a comparison to view the summary and diff.')}</Text>
                  </Alert>
                )}

                {comparisonPages.map((page) => {
                  const highlights = highlightMaps.comparison.get(page.pageNumber) ?? [];
                  const vOffset = 2 / page.height; // ~2px downward adjustment
                  const basePage = basePages.find(p => p.pageNumber === page.pageNumber);
                  const targetHeight = basePage ? Math.max(page.height, basePage.height) : page.height;
                  const fit = targetHeight / page.height;
                  const rowHeightPx = getRowHeightPx(page.pageNumber);

                  return (
                    <div key={`comparison-page-${page.pageNumber}`} className="compare-diff-page" style={{ minHeight: `${rowHeightPx}px` }}>
                      <Text size="xs" fw={600} c="dimmed">
                        {t('compare.summary.comparisonHeading', 'Comparison document')} · {t('compare.summary.pageLabel', 'Page')}{' '}
                        {page.pageNumber}
                      </Text>
                      <div className="compare-diff-page__canvas" style={{ width: `${Math.round(page.width * fit * comparisonZoom)}px`, maxWidth: '100%', overflow: 'visible' }}>
                        <div style={{ position: 'relative', width: '100%', aspectRatio: `${page.width} / ${page.height}` }}>
                          <img src={page.url} alt={t('compare.summary.comparisonHeading', 'Comparison document')} loading="lazy" style={{ width: '100%', height: '100%' }} />
                          {(() => {
                            // Render per-word highlights with stable IDs
                            const wordRects = wordHighlightMaps.comparison.get(page.pageNumber) ?? [];

                            const byGroup = new Map<string, TokenBoundingBox[]>();
                            for (const { rect, index } of wordRects) {
                              const id = comparisonTokenIndexToGroupId.get(index) ?? `comparison-token-${index}`;
                              const arr = byGroup.get(id) ?? [];
                              arr.push(rect);
                              byGroup.set(id, arr);
                            }

                            const EPS_X = 0.02;
                            const EPS_Y = 0.006;
                            const mergeSameLine = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
                              if (rects.length === 0) return rects;
                              const sorted = rects.slice().sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
                              const merged: TokenBoundingBox[] = [];
                              for (const r of sorted) {
                                const last = merged[merged.length - 1];
                                if (last && Math.abs(r.top - last.top) < EPS_Y && r.left <= last.left + last.width + EPS_X) {
                                  const left = Math.min(last.left, r.left);
                                  const right = Math.max(last.left + last.width, r.left + r.width);
                                  const top = Math.min(last.top, r.top);
                                  const bottom = Math.max(last.top + last.height, r.top + r.height);
                                  last.left = left;
                                  last.top = top;
                                  last.width = Math.max(0, right - left);
                                  last.height = Math.max(0, bottom - top);
                                } else {
                                  merged.push({ ...r });
                                }
                              }
                              return merged;
                            };

                            const spans: JSX.Element[] = [];
                            byGroup.forEach((rects, id) => {
                              const mergedRects = mergeSameLine(rects);
                              mergedRects.forEach((rect, mIndex) => {
                                spans.push(
                                  <span
                                    key={`comparison-highlight-${page.pageNumber}-${id}-${mIndex}`}
                                    data-change-id={id}
                                    className="compare-diff-highlight"
                                    style={{
                                      left: `${rect.left * 100}%`,
                                      top: `${(rect.top + vOffset) * 100}%`,
                                      width: `${rect.width * 100}%`,
                                      height: `${rect.height * 100}%`,
                                      backgroundColor: toRgba(ADDITION_HIGHLIGHT, 0.35),
                                    }}
                                  />
                                );
                              });
                            });

                            return spans;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </Stack>
              </div>
            </div>
          </div>
        </Stack>
    </Stack>
  );
};

export default CompareWorkbenchView;
