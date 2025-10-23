import React, { ForwardedRef, JSX, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Stack, Text, Paper, ActionIcon } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import {
  ADDITION_HIGHLIGHT,
  CompareDiffToken,
  CompareResultData,
  CompareTokenMetadata,
  REMOVAL_HIGHLIGHT,
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
import { toRgba } from './compareUtils';
import { PagePreview, WordHighlightEntry } from './types';
import CompareDocumentPane from './CompareDocumentPane';

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
  const panDragRef = useRef<{ active: boolean; source: 'base' | 'comparison' | null; startX: number; startY: number; startPanX: number; startPanY: number; targetStartPanX: number; targetStartPanY: number }>(
    { active: false, source: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0, targetStartPanX: 0, targetStartPanY: 0 }
  );
  const lastActivePaneRef = useRef<'base' | 'comparison'>('base');
  const [baseZoom, setBaseZoom] = useState(1);
  const [comparisonZoom, setComparisonZoom] = useState(1);
  const [basePan, setBasePan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [comparisonPan, setComparisonPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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

  const processingMessage = t('compare.status.processing', 'Analyzing differences...');
  const emptyMessage = t('compare.view.noData', 'Run a comparison to view the summary and diff.');
  const baseDocumentLabel = t('compare.summary.baseHeading', 'Base document');
  const comparisonDocumentLabel = t('compare.summary.comparisonHeading', 'Comparison document');
  const pageLabel = t('compare.summary.pageLabel', 'Page');



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

    // Normalize positions (guard against zero scroll ranges)
    const sVMax = Math.max(1, source.scrollHeight - source.clientHeight);
    const sHMax = Math.max(1, source.scrollWidth - source.clientWidth);
    const tVMax = Math.max(1, target.scrollHeight - target.clientHeight);
    // If target cannot scroll vertically, skip syncing to avoid jumps
    if (tVMax <= 1) {
      return;
    }

    const sV = source.scrollTop / sVMax;
    const sH = source.scrollLeft / sHMax;

    // If base is source, comp = base + delta; if comp is source, base = comp - delta
    const desiredTV = sourceIsBase ? sV + deltaV : sV - deltaV;
    // Only sync vertical scrolling to avoid layout-induced jumps with differing orientations

    const clampedTV = Math.max(0, Math.min(1, desiredTV));
    // Horizontal sync disabled intentionally

    isSyncingRef.current = true;
    target.scrollTop = clampedTV * tVMax;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const getMaxCanvasSize = useCallback((pane: 'base' | 'comparison') => {
    const pages = pane === 'base' ? basePages : comparisonPages;
    const peers = pane === 'base' ? comparisonPages : basePages;
    let maxW = 0;
    let maxH = 0;
    for (const page of pages) {
      const peer = peers.find(p => p.pageNumber === page.pageNumber);
      const targetHeight = peer ? Math.max(page.height, peer.height) : page.height;
      const fit = targetHeight / page.height;
      const width = Math.round(page.width * fit);
      const height = Math.round(targetHeight);
      if (width > maxW) maxW = width;
      if (height > maxH) maxH = height;
    }
    return { maxW, maxH };
  }, [basePages, comparisonPages]);

  const getPanBounds = useCallback((pane: 'base' | 'comparison') => {
    const { maxW, maxH } = getMaxCanvasSize(pane);
    const zoom = pane === 'base' ? baseZoom : comparisonZoom;
    const extraX = Math.max(0, Math.round(maxW * (zoom - 1)));
    const extraY = Math.max(0, Math.round(maxH * (zoom - 1)));
    return { maxX: extraX, maxY: extraY };
  }, [getMaxCanvasSize, baseZoom, comparisonZoom]);

  const beginPan = (pane: 'base' | 'comparison', e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanMode) return;
    const zoom = pane === 'base' ? baseZoom : comparisonZoom;
    if (zoom <= 1) return;
    const container = pane === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    const other = pane === 'base' ? comparisonScrollRef.current : baseScrollRef.current;
    if (!container) return;
    // Only start inner-content panning when the drag starts over the image content
    const targetEl = e.target as HTMLElement | null;
    const isOnImage = !!targetEl?.closest('.compare-diff-page__inner');
    if (!isOnImage) return; // allow normal scrolling outside the image
    e.preventDefault();
    panDragRef.current = {
      active: true,
      source: pane,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pane === 'base' ? basePan.x : comparisonPan.x,
      startPanY: pane === 'base' ? basePan.y : comparisonPan.y,
      targetStartPanX: pane === 'base' ? comparisonPan.x : basePan.x,
      targetStartPanY: pane === 'base' ? comparisonPan.y : basePan.y,
    };
    lastActivePaneRef.current = pane;
    (container as HTMLDivElement).style.cursor = 'grabbing';
  };

  const continuePan = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanMode) return;
    const drag = panDragRef.current;
    if (!drag.active || !drag.source) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    const isBase = drag.source === 'base';
    const bounds = getPanBounds(drag.source);
    const nextX = Math.max(0, Math.min(bounds.maxX, drag.startPanX - dx));
    const nextY = Math.max(0, Math.min(bounds.maxY, drag.startPanY - dy));
    if (isBase) setBasePan({ x: nextX, y: nextY }); else setComparisonPan({ x: nextX, y: nextY });

    if (isScrollLinked) {
      const otherPane: 'base' | 'comparison' = isBase ? 'comparison' : 'base';
      const otherBounds = getPanBounds(otherPane);
      const scaleX = bounds.maxX > 0 ? otherBounds.maxX / bounds.maxX : 0;
      const scaleY = bounds.maxY > 0 ? otherBounds.maxY / bounds.maxY : 0;
      const otherNextX = Math.max(0, Math.min(otherBounds.maxX, panDragRef.current.targetStartPanX - dx * scaleX));
      const otherNextY = Math.max(0, Math.min(otherBounds.maxY, panDragRef.current.targetStartPanY - dy * scaleY));
      if (isBase) setComparisonPan({ x: otherNextX, y: otherNextY }); else setBasePan({ x: otherNextX, y: otherNextY });
    }
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
    } else if (e.touches.length === 1) {
      if (!isPanMode) return;
      const zoom = pane === 'base' ? baseZoom : comparisonZoom;
      if (zoom <= 1) return;
      const targetEl = e.target as HTMLElement | null;
      const isOnImage = !!targetEl?.closest('.compare-diff-page__inner');
      if (!isOnImage) return;
      const touch = e.touches[0];
      panDragRef.current = {
        active: true,
        source: pane,
        startX: touch.clientX,
        startY: touch.clientY,
        startPanX: pane === 'base' ? basePan.x : comparisonPan.x,
        startPanY: pane === 'base' ? basePan.y : comparisonPan.y,
        targetStartPanX: pane === 'base' ? comparisonPan.x : basePan.x,
        targetStartPanY: pane === 'base' ? comparisonPan.y : basePan.y,
      };
      e.preventDefault();
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const distance = Math.hypot(dx, dy);
      const scale = distance / Math.max(1, pinchRef.current.startDistance);
      const dampened = 1 + (scale - 1) * 0.6;
      const pane = pinchRef.current.pane!;
      const startZoom = pinchRef.current.startZoom;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(startZoom * dampened).toFixed(2)));
      if (pane === 'base') setBaseZoom(nextZoom); else setComparisonZoom(nextZoom);
      e.preventDefault();
      return;
    }
    // One-finger pan
    if (panDragRef.current.active && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - panDragRef.current.startX;
      const dy = touch.clientY - panDragRef.current.startY;
      const isBase = panDragRef.current.source === 'base';
      const bounds = getPanBounds(panDragRef.current.source!);
      const nextX = Math.max(0, Math.min(bounds.maxX, panDragRef.current.startPanX - dx));
      const nextY = Math.max(0, Math.min(bounds.maxY, panDragRef.current.startPanY - dy));
      if (isBase) setBasePan({ x: nextX, y: nextY }); else setComparisonPan({ x: nextX, y: nextY });
      if (isScrollLinked) {
        const otherPane: 'base' | 'comparison' = isBase ? 'comparison' : 'base';
        const otherBounds = getPanBounds(otherPane);
        const scaleX = bounds.maxX > 0 ? otherBounds.maxX / bounds.maxX : 0;
        const scaleY = bounds.maxY > 0 ? otherBounds.maxY / bounds.maxY : 0;
        const otherNextX = Math.max(0, Math.min(otherBounds.maxX, panDragRef.current.targetStartPanX - dx * scaleX));
        const otherNextY = Math.max(0, Math.min(otherBounds.maxY, panDragRef.current.targetStartPanY - dy * scaleY));
        if (isBase) setComparisonPan({ x: otherNextX, y: otherNextY }); else setBasePan({ x: otherNextX, y: otherNextY });
      }
      e.preventDefault();
    }
  };

  const onTouchEnd = () => {
    pinchRef.current.active = false;
    pinchRef.current.pane = null;
    panDragRef.current.active = false;
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
    if (!result) {
      return {
        base: new Map<number, WordHighlightEntry[]>(),
        comparison: new Map<number, WordHighlightEntry[]>(),
      };
    }
    const baseMap = new Map<number, WordHighlightEntry[]>();
    const comparisonMap = new Map<number, WordHighlightEntry[]>();

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
    // Row height must remain constant regardless of zoom.
    const baseHeight = basePage ? basePage.height : 0;
    const compHeight = compPage ? compPage.height : 0;
    const rowHeight = Math.max(baseHeight, compHeight);
    return Math.round(rowHeight);
  }, [basePages, comparisonPages]);

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

  // Drag-to-pan: adjust scroll positions directly for smooth, synced panning
  // No pan/zoom handlers in simplified mode

  if (!result) {
    return renderUploadLayout();
  }

  // Safe to access result and the computed arrays below this point
  const baseTitle = `${result.base.fileName} - ${basePages.length} pages`;
  const comparisonTitle = `${result.comparison.fileName} - ${comparisonPages.length} pages`;
  const baseDropdownPlaceholder = `Deletions (${baseWordChanges.length})`;
  const comparisonDropdownPlaceholder = `Additions (${comparisonWordChanges.length})`;

  return (
    <Stack className="compare-workbench">
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
        <Stack gap="lg" className="compare-workbench__content">

          <div
            className={`compare-workbench__columns ${layout === 'stacked' ? 'compare-workbench__columns--stacked' : ''}`}
          >
            <CompareDocumentPane
              pane="base"
              scrollRef={baseScrollRef}
              peerScrollRef={comparisonScrollRef}
              handleScrollSync={handleScrollSync}
              beginPan={beginPan}
              continuePan={continuePan}
              endPan={endPan}
              handleWheelZoom={handleWheelZoom}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={baseZoom}
              pan={basePan}
              title={baseTitle}
              dropdownPlaceholder={baseDropdownPlaceholder}
              changes={baseWordChanges.map(({ value, label }) => ({ value, label }))}
              onNavigateChange={(value) => handleChangeNavigation(value, 'base')}
              isLoading={baseLoading}
              processingMessage={processingMessage}
              emptyMessage={emptyMessage}
              pages={basePages}
              pairedPages={comparisonPages}
              getRowHeightPx={getRowHeightPx}
              highlightColor={REMOVAL_HIGHLIGHT}
              highlightOpacity={0.45}
              offsetPixels={4}
              wordHighlightMap={wordHighlightMaps.base}
              tokenIndexToGroupId={baseTokenIndexToGroupId}
              documentLabel={baseDocumentLabel}
              pageLabel={pageLabel}
              altLabel={baseDocumentLabel}
            />
            <CompareDocumentPane
              pane="comparison"
              scrollRef={comparisonScrollRef}
              peerScrollRef={baseScrollRef}
              handleScrollSync={handleScrollSync}
              beginPan={beginPan}
              continuePan={continuePan}
              endPan={endPan}
              handleWheelZoom={handleWheelZoom}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={comparisonZoom}
              pan={comparisonPan}
              title={comparisonTitle}
              dropdownPlaceholder={comparisonDropdownPlaceholder}
              changes={comparisonWordChanges.map(({ value, label }) => ({ value, label }))}
              onNavigateChange={(value) => handleChangeNavigation(value, 'comparison')}
              isLoading={comparisonLoading}
              processingMessage={processingMessage}
              emptyMessage={emptyMessage}
              pages={comparisonPages}
              pairedPages={basePages}
              getRowHeightPx={getRowHeightPx}
              highlightColor={ADDITION_HIGHLIGHT}
              highlightOpacity={0.35}
              offsetPixels={2}
              wordHighlightMap={wordHighlightMaps.comparison}
              tokenIndexToGroupId={comparisonTokenIndexToGroupId}
              documentLabel={comparisonDocumentLabel}
              pageLabel={pageLabel}
              altLabel={comparisonDocumentLabel}
            />
          </div>
        </Stack>
    </Stack>
  );
};

export default CompareWorkbenchView;
