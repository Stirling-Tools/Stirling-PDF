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
    // High-DPI rendering while keeping logical display size constant
    const DISPLAY_SCALE = 1; // logical CSS size for layout
    // Render at very high pixel density so zooming into words remains sharp
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    // Faster initial load; still crisp on common zoom levels. We can re-tune if needed.
    const RENDER_SCALE = Math.max(2, Math.min(3, dpr * 2));

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const displayViewport = page.getViewport({ scale: DISPLAY_SCALE });
      const renderViewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.width = Math.round(renderViewport.width);
      canvas.height = Math.round(renderViewport.height);

      if (!context) {
        page.cleanup();
        continue;
      }

      await page.render({ canvasContext: context, viewport: renderViewport, canvas }).promise;
      previews.push({
        pageNumber,
        width: Math.round(displayViewport.width),
        height: Math.round(displayViewport.height),
        rotation: (page.rotate || 0) % 360,
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
  const ZOOM_MAX = 100000;
  const ZOOM_STEP = 0.1;
  const wheelZoomAccumRef = useRef<{ base: number; comparison: number }>({ base: 0, comparison: 0 });
  const pinchRef = useRef<{ active: boolean; pane: 'base' | 'comparison' | null; startDistance: number; startZoom: number }>(
    { active: false, pane: null, startDistance: 0, startZoom: 1 }
  );

  // Compute maximum canvas size (unzoomed) across pages for pan bounds
  

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
        const nextBase = Math.max(ZOOM_MIN, +(baseZoom - ZOOM_STEP).toFixed(2));
        const nextComp = Math.max(ZOOM_MIN, +(comparisonZoom - ZOOM_STEP).toFixed(2));
        setBaseZoom(nextBase);
        setComparisonZoom(nextComp);
        centerPanForZoom('base', nextBase);
        centerPanForZoom('comparison', nextComp);
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
        const nextBase = Math.min(ZOOM_MAX, +(baseZoom + ZOOM_STEP).toFixed(2));
        const nextComp = Math.min(ZOOM_MAX, +(comparisonZoom + ZOOM_STEP).toFixed(2));
        setBaseZoom(nextBase);
        setComparisonZoom(nextComp);
        clampPanForZoom('base', nextBase);
        clampPanForZoom('comparison', nextComp);
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
        // Center content for default zoom
        centerPanForZoom('base', 1);
        centerPanForZoom('comparison', 1);
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
  ], [layout, t, toggleLayout, isScrollLinked, isPanMode, baseZoom, comparisonZoom]);

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

  const getPanBounds = useCallback((pane: 'base' | 'comparison', zoomOverride?: number) => {
    // Prefer actual canvas size from DOM for the current pane; fallback to precomputed max
    const container = pane === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    const canvasEl = container?.querySelector('.compare-diff-page__canvas') as HTMLElement | null;
    let canvasW: number | null = null;
    let canvasH: number | null = null;
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      canvasW = Math.max(0, Math.round(rect.width));
      canvasH = Math.max(0, Math.round(rect.height));
    }

    const fallback = getMaxCanvasSize(pane);
    const W = canvasW ?? fallback.maxW;
    const H = canvasH ?? fallback.maxH;
    const zoom = zoomOverride !== undefined ? zoomOverride : (pane === 'base' ? baseZoom : comparisonZoom);
    // Content grows by (zoom - 1) relative to viewport (transform-origin: top-left)
    // So the maximum pan equals contentWidth - viewportWidth = W * (zoom - 1)
    const extraX = Math.max(0, W * (Math.max(zoom, 1) - 1));
    const extraY = Math.max(0, H * (Math.max(zoom, 1) - 1));
    return { maxX: extraX, maxY: extraY };
  }, [getMaxCanvasSize, baseZoom, comparisonZoom]);

  const getPaneRotation = useCallback((pane: 'base' | 'comparison') => {
    const pages = pane === 'base' ? basePages : comparisonPages;
    // Use first page rotation (assume uniform in compare context)
    const r = pages[0]?.rotation ?? 0;
    const norm = ((r % 360) + 360) % 360;
    return norm as 0 | 90 | 180 | 270 | number;
  }, [basePages, comparisonPages]);

  // Map pan from source pane to equivalent logical location in target pane accounting for rotation
  const mapPanBetweenOrientations = useCallback((
    source: 'base' | 'comparison',
    target: 'base' | 'comparison',
    sourcePan: { x: number; y: number }
  ) => {
    const sRot = getPaneRotation(source);
    const tRot = getPaneRotation(target);
    const sBounds = getPanBounds(source);
    const tBounds = getPanBounds(target);

    // Use symmetric normalized coordinates with origin at content center to improve perceptual alignment
    const sx = sBounds.maxX === 0 ? 0 : (sourcePan.x / sBounds.maxX) * 2 - 1; // [-1, 1]
    const sy = sBounds.maxY === 0 ? 0 : (sourcePan.y / sBounds.maxY) * 2 - 1; // [-1, 1]

    // Convert to logical normalized coords with origin at top-left regardless of rotation
    // For a zoomed canvas, pan (x,y) means how far we've moved from origin within extra space
    // Normalized mapping across rotations:
    // rot 0: (nx, ny)
    // rot 90: (ny, 1 - nx)
    // rot 180: (1 - nx, 1 - ny)
    // rot 270: (1 - ny, nx)
    const apply = (nx: number, ny: number, rot: number) => {
      const r = ((rot % 360) + 360) % 360;
      if (r === 0) return { nx, ny };
      if (r === 90) return { nx: ny, ny: -nx };
      if (r === 180) return { nx: -nx, ny: -ny };
      if (r === 270) return { nx: -ny, ny: nx };
      // Fallback for non-right-angle rotations (shouldn't occur here)
      return { nx, ny };
    };

    const logical = apply(sx, sy, sRot);
    const targetCentered = apply(logical.nx, logical.ny, (360 - tRot));

    // Map back from [-1,1] centered to [0,1] top-left origin before scaling
    const targetNormX = (targetCentered.nx + 1) / 2;
    const targetNormY = (targetCentered.ny + 1) / 2;

    const tx = Math.max(0, Math.min(tBounds.maxX, targetNormX * tBounds.maxX));
    const ty = Math.max(0, Math.min(tBounds.maxY, targetNormY * tBounds.maxY));
    return { x: tx, y: ty };
  }, [getPaneRotation, getPanBounds]);

  const reconcileLinkedPan = useCallback((
    source: 'base' | 'comparison',
    desiredActive: { x: number; y: number }
  ) => {
    const other: 'base' | 'comparison' = source === 'base' ? 'comparison' : 'base';
    const desiredOther = mapPanBetweenOrientations(source, other, desiredActive);
    const otherBounds = getPanBounds(other);
    const clampedOther = {
      x: Math.max(0, Math.min(otherBounds.maxX, desiredOther.x)),
      y: Math.max(0, Math.min(otherBounds.maxY, desiredOther.y)),
    };
    // Do NOT constrain the active pane due to peer clamp; keep desiredActive (already clamped to source bounds earlier)
    return { active: desiredActive, other: clampedOther };
  }, [getPanBounds, mapPanBetweenOrientations]);

  const centerPanForZoom = useCallback((pane: 'base' | 'comparison', zoomValue: number) => {
    const bounds = getPanBounds(pane, zoomValue);
    const center = { x: Math.round(bounds.maxX / 2), y: Math.round(bounds.maxY / 2) };
    if (pane === 'base') setBasePan(center); else setComparisonPan(center);
  }, [getPanBounds]);

  const clampPanForZoom = useCallback((pane: 'base' | 'comparison', zoomValue: number) => {
    const bounds = getPanBounds(pane, zoomValue);
    const current = pane === 'base' ? basePan : comparisonPan;
    const clamped = {
      x: Math.max(0, Math.min(bounds.maxX, current.x)),
      y: Math.max(0, Math.min(bounds.maxY, current.y)),
    };
    if (pane === 'base') setBasePan(clamped); else setComparisonPan(clamped);
  }, [getPanBounds, basePan, comparisonPan]);

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
    const desired = {
      x: Math.max(0, Math.min(bounds.maxX, drag.startPanX - dx)),
      y: Math.max(0, Math.min(bounds.maxY, drag.startPanY - dy)),
    };
    if (isScrollLinked) {
      // Active-dominant: always set the active pane to desired; map and clamp peer only
      if (isBase) setBasePan(desired); else setComparisonPan(desired);
      const otherPane: 'base' | 'comparison' = isBase ? 'comparison' : 'base';
      const mappedPeer = mapPanBetweenOrientations(drag.source, otherPane, desired);
      const peerBounds = getPanBounds(otherPane);
      const clampedPeer = {
        x: Math.max(0, Math.min(peerBounds.maxX, mappedPeer.x)),
        y: Math.max(0, Math.min(peerBounds.maxY, mappedPeer.y)),
      };
      if (isBase) setComparisonPan(clampedPeer); else setBasePan(clampedPeer);
    } else {
      if (isBase) setBasePan(desired); else setComparisonPan(desired);
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
      const prev = baseZoom;
      const next = applySteps(prev);
      setBaseZoom(next);
      // Recenter when zooming out; clamp when zooming in
      if (next < prev) centerPanForZoom('base', next); else clampPanForZoom('base', next);
    } else {
      const prev = comparisonZoom;
      const next = applySteps(prev);
      setComparisonZoom(next);
      if (next < prev) centerPanForZoom('comparison', next); else clampPanForZoom('comparison', next);
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
      const prevZoom = pane === 'base' ? baseZoom : comparisonZoom;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(startZoom * dampened).toFixed(2)));
      if (pane === 'base') {
        setBaseZoom(nextZoom);
        if (nextZoom < prevZoom) centerPanForZoom('base', nextZoom); // zoom out => center
        // zoom in: preserve current focal area by not jumping; just clamp within new bounds
        if (nextZoom > prevZoom) clampPanForZoom('base', nextZoom);
      } else {
        setComparisonZoom(nextZoom);
        if (nextZoom < prevZoom) centerPanForZoom('comparison', nextZoom);
        if (nextZoom > prevZoom) clampPanForZoom('comparison', nextZoom);
      }
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
      const desired = {
        x: Math.max(0, Math.min(bounds.maxX, panDragRef.current.startPanX - dx)),
        y: Math.max(0, Math.min(bounds.maxY, panDragRef.current.startPanY - dy)),
      };
      if (isScrollLinked) {
        if (isBase) setBasePan(desired); else setComparisonPan(desired);
        const otherPane: 'base' | 'comparison' = isBase ? 'comparison' : 'base';
        const mappedPeer = mapPanBetweenOrientations(isBase ? 'base' : 'comparison', otherPane, desired);
        const peerBounds = getPanBounds(otherPane);
        const clampedPeer = {
          x: Math.max(0, Math.min(peerBounds.maxX, mappedPeer.x)),
          y: Math.max(0, Math.min(peerBounds.maxY, mappedPeer.y)),
        };
        if (isBase) setComparisonPan(clampedPeer); else setBasePan(clampedPeer);
      } else {
        if (isBase) setBasePan(desired); else setComparisonPan(desired);
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
