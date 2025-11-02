import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { InteractionManagerPluginPackage, PagePointerProvider, GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { SpreadPluginPackage, SpreadMode } from '@embedpdf/plugin-spread/react';
import { SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { RotatePluginPackage, Rotate } from '@embedpdf/plugin-rotate/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { RedactionPluginPackage, RedactionLayer, useRedaction } from '@embedpdf/plugin-redaction/react';
import type { SelectionMenuProps } from '@embedpdf/plugin-redaction/react';
import { Stack, Group, Text, Button, Loader, Alert } from '@mantine/core';
import Warning from '@app/components/shared/Warning';
import { useTranslation } from 'react-i18next';
import CropFreeRoundedIcon from '@mui/icons-material/CropFreeRounded';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import ToolLoadingFallback from '@app/components/tools/ToolLoadingFallback';
import { alert } from '@app/components/toast';
import { useRightRailButtons, type RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import type { ManualRedactionWorkbenchData } from '@app/types/redact';

interface ManualRedactionWorkbenchViewProps {
  data: ManualRedactionWorkbenchData | null;
}

const toPdfBlob = async (value: any): Promise<Blob | null> => {
  if (!value) return null;
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer) return new Blob([value], { type: 'application/pdf' });
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return new Blob([copy.buffer], { type: 'application/pdf' });
  }
  if (value.data instanceof ArrayBuffer) return new Blob([value.data], { type: 'application/pdf' });
  if (value.blob instanceof Blob) return value.blob;
  if (typeof value.toBlob === 'function') {
    return value.toBlob();
  }
  if (typeof value.toPromise === 'function') {
    const result = await value.toPromise();
    if (result instanceof ArrayBuffer) return new Blob([result], { type: 'application/pdf' });
  }
  if (typeof value.arrayBuffer === 'function') {
    const buffer = await value.arrayBuffer();
    return new Blob([buffer], { type: 'application/pdf' });
  }
  return null;
};

const buildRedactedFileName = (name: string | undefined | null) => {
  if (!name || name.trim() === '') {
    return 'redacted.pdf';
  }

  const lower = name.toLowerCase();
  if (lower.includes('redacted')) {
    return name;
  }

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) {
    return `${name}_redacted.pdf`;
  }

  const base = name.slice(0, dotIndex);
  const ext = name.slice(dotIndex);
  return `${base}_redacted${ext}`;
};

const ManualRedactionWorkbenchView = ({ data }: ManualRedactionWorkbenchViewProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const redactionApiRef = useRef<Record<string, any> | null>(null);
  const exportApiRef = useRef<Record<string, any> | null>(null);
  const selectionApiRef = useRef<Record<string, any> | null>(null);
  const historyApiRef = useRef<Record<string, any> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  // Removed undo/redo controls; plugin state still manages pending internally
  const [activeType, setActiveType] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const desiredModeRef = useRef<'area' | 'text' | null>(null);
  const correctingModeRef = useRef(false);
  const selectedFile = data?.file ?? null;
  const redactionPluginPackage = RedactionPluginPackage;
  const RedactionLayerComponent = RedactionLayer;
  const hasRedactionSupport = Boolean(redactionPluginPackage && RedactionLayerComponent);
  const exitWorkbench = useCallback(() => {
    if (data?.onExit) {
      data.onExit();
    } else {
      navigationActions.setWorkbench('fileEditor');
    }
  }, [data, navigationActions]);

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPdfUrl(url);
      setObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setObjectUrl(null);
      };
    }

    setPdfUrl(null);
    return () => {};
  }, [selectedFile]);

  const { engine, isLoading, error } = usePdfiumEngine();

  const plugins = useMemo(() => {
    if (!pdfUrl) return [];

    const rootFontSize = typeof window !== 'undefined'
      ? parseFloat(getComputedStyle(document.documentElement).fontSize)
      : 16;
    const viewportGap = rootFontSize * 3.5;

    const baseRegistrations: any[] = [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: 'url',
          pdfFile: {
            id: 'stirling-pdf-manual-redaction',
            url: pdfUrl,
          },
        },
      }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap }),
      createPluginRegistration(ScrollPluginPackage, {
        strategy: ScrollStrategy.Vertical,
        initialPage: 0,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      // Intentionally omit Pan plugin here so drag gestures are captured by redaction/selection layers
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: 1.2,
        minZoom: 0.25,
        maxZoom: 4,
      }),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 5,
        extraRings: 1,
      }),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(SearchPluginPackage),
      createPluginRegistration(ThumbnailPluginPackage),
      createPluginRegistration(RotatePluginPackage),
      createPluginRegistration(ExportPluginPackage, {
        defaultFileName: buildRedactedFileName(data?.fileName),
      }),
    ];
    if (hasRedactionSupport) {
      baseRegistrations.splice(6, 0, createPluginRegistration(redactionPluginPackage, { autoPreview: true }));
    }
    return baseRegistrations;
  }, [pdfUrl, data?.fileName, hasRedactionSupport, redactionPluginPackage]);

  const assignPluginApi = useCallback((plugin: any, ref: React.MutableRefObject<Record<string, any> | null>, onReady?: () => void) => {
    if (!plugin || typeof plugin.provides !== 'function') return;

    try {
      const provided = plugin.provides();
      if (provided && typeof provided.then === 'function') {
        provided
          .then((resolved: any) => {
            ref.current = resolved ?? null;
            onReady?.();
          })
          .catch((err: any) => {
            console.warn('[manual-redaction] Failed to resolve plugin capability', err);
          });
      } else {
        ref.current = provided ?? null;
        onReady?.();
      }
    } catch (err) {
      console.warn('[manual-redaction] Plugin capability unavailable', err);
    }
  }, [hasRedactionSupport]);

  const handleInitialized = useCallback(async (registry: any) => {
    const redactionPlugin = hasRedactionSupport ? registry.getPlugin?.('redaction') : null;
    const exportPlugin = registry.getPlugin?.('export');
    const historyPlugin = registry.getPlugin?.('history');

    if (hasRedactionSupport) {
      assignPluginApi(redactionPlugin, redactionApiRef, () => {
        setIsReady(true);
        // default to area redaction mode
        enableAreaRedaction();
        // no pan plugin: drags go to redaction/selection layers
        // subscribe to state changes to drive undo/redo availability
        try {
          const api = redactionApiRef.current;
          api?.onStateChange?.((state: any) => {
            setActiveType(state?.activeType ?? null);

            // Prevent unexpected plugin mode flips (e.g., switching to text after area drag)
            const desired = desiredModeRef.current;
            const isAreaDesired = desired === 'area';
            const isTextDesired = desired === 'text';
            const isAreaActive = state?.activeType === 'marqueeRedact' || state?.activeType === 'area';
            const isTextActive = state?.activeType === 'redactSelection' || state?.activeType === 'text';
            if (!correctingModeRef.current) {
              if (isAreaDesired && !isAreaActive) {
                correctingModeRef.current = true;
                // best-effort attempts to re-activate area mode
                enableAreaRedaction();
                setTimeout(() => { correctingModeRef.current = false; }, 0);
              } else if (isTextDesired && !isTextActive) {
                correctingModeRef.current = true;
                enableTextRedaction();
                setTimeout(() => { correctingModeRef.current = false; }, 0);
              }
            }
          });
        } catch {}
      });
    } else {
      setIsReady(false);
    }
    assignPluginApi(exportPlugin, exportApiRef);
    assignPluginApi(historyPlugin, historyApiRef);
    const selectionPlugin = registry.getPlugin?.('selection');
    assignPluginApi(selectionPlugin, selectionApiRef);
  }, [assignPluginApi, hasRedactionSupport]);

  const invokeRedactionMethod = useCallback((names: string[], args: any[] = []) => {
    if (!hasRedactionSupport) return false;
    const api = redactionApiRef.current;
    if (!api) return false;
    for (const name of names) {
      const candidate = (api as Record<string, any>)[name];
      if (typeof candidate === 'function') {
        try {
          const result = candidate.apply(api, args);
          if (result && typeof result.then === 'function') {
            // Fire and forget for interactive methods
            result.catch((err: any) => console.warn(`[manual-redaction] ${name} failed`, err));
          }
          return true;
        } catch (err) {
          console.warn(`[manual-redaction] ${name} threw`, err);
        }
      }
    }
    return false;
  }, []);

  const invokeRedactionMethodAsync = useCallback(async (names: string[], args: any[] = []) => {
    if (!hasRedactionSupport) return false;
    const api = redactionApiRef.current;
    if (!api) return false;
    for (const name of names) {
      const candidate = (api as Record<string, any>)[name];
      if (typeof candidate === 'function') {
        try {
          const result = candidate.apply(api, args);
          if (result && typeof result.then === 'function') {
            await result;
          }
          return true;
        } catch (err) {
          console.warn(`[manual-redaction] ${name} failed`, err);
        }
      }
    }
    return false;
  }, []);

  const enableAreaRedaction = useCallback(() => {
    if (!hasRedactionSupport) return;
    const api = redactionApiRef.current;
    // Ensure selection plugin is not intercepting as text selection
    try { selectionApiRef.current?.setMode?.('none'); } catch {}
    desiredModeRef.current = 'area';
    // Prefer official capability
    if (api?.toggleMarqueeRedact) {
      try { api.toggleMarqueeRedact(); setActiveType('marqueeRedact'); return; } catch {}
    }
    // Fall back to common method names
    const areaNames = ['area', 'box', 'rectangle', 'shape'];
    for (const mode of areaNames) {
      if (invokeRedactionMethod(['activateAreaRedaction', 'startAreaRedaction', 'enableAreaRedaction', 'activateMode'], [mode])) return;
      if (invokeRedactionMethod(['setRedactionMode', 'setMode'], [mode])) return;
      if (invokeRedactionMethod(['setRedactionMode', 'setMode'], [{ mode }])) return;
      if (invokeRedactionMethod(['setMode'], [{ type: mode }])) return;
      if (invokeRedactionMethod(['setMode'], [mode.toUpperCase?.() ?? mode])) return;
    }
    console.warn('[manual-redaction] No compatible area redaction activation method found');
  }, [hasRedactionSupport, invokeRedactionMethod]);

  const enableTextRedaction = useCallback(() => {
    if (!hasRedactionSupport) return;
    const api = redactionApiRef.current;
    // Ensure selection plugin is in text mode when redacting text
    try { selectionApiRef.current?.setMode?.('text'); } catch {}
    desiredModeRef.current = 'text';
    if (api?.toggleRedactSelection) {
      try { api.toggleRedactSelection(); setActiveType('redactSelection'); return; } catch {}
    }
    const textModes = ['text', 'search', 'pattern'];
    for (const mode of textModes) {
      if (invokeRedactionMethod(['activateTextRedaction', 'startTextRedaction', 'enableTextRedaction', 'activateMode'], [mode])) return;
      if (invokeRedactionMethod(['setRedactionMode', 'setMode'], [mode])) return;
      if (invokeRedactionMethod(['setRedactionMode', 'setMode'], [{ mode }])) return;
      if (invokeRedactionMethod(['setMode'], [{ type: mode }])) return;
      if (invokeRedactionMethod(['setMode'], [mode.toUpperCase?.() ?? mode])) return;
    }
    console.warn('[manual-redaction] No compatible text redaction activation method found');
  }, [hasRedactionSupport, invokeRedactionMethod]);

  // Undo/Redo removed from UI; users can remove individual marks via the inline menu

  const exportRedactedBlob = useCallback(async (): Promise<Blob | null> => {
    if (!hasRedactionSupport) {
      throw new Error('Manual redaction plugin is not available.');
    }
    const redactionApi = redactionApiRef.current;
    const exportApi = exportApiRef.current;

    const tryCall = async (api: Record<string, any> | null, method: string, args: any[] = []): Promise<any> => {
      if (!api) return null;
      const candidate = api[method];
      if (typeof candidate !== 'function') return null;
      try {
        const result = candidate.apply(api, args);
        if (result && typeof result.then === 'function') {
          return await result;
        }
        return result;
      } catch (err) {
        console.warn(`[manual-redaction] ${method} failed`, err);
        return null;
      }
    };

    const attempts: Array<[Record<string, any> | null, string, any[]]> = [
      [redactionApi, 'exportRedactedDocument', [{ type: 'blob' }]],
      [redactionApi, 'exportRedactedDocument', []],
      [redactionApi, 'getRedactedDocument', []],
      [redactionApi, 'getBlob', []],
      [redactionApi, 'download', [{ type: 'blob' }]],
      [exportApi, 'exportDocument', [{ type: 'blob' }]],
      [exportApi, 'exportDocument', []],
      [exportApi, 'download', [{ type: 'blob' }]],
    ];

    for (const [api, method, args] of attempts) {
      const result = await tryCall(api, method, args);
      const blob = await toPdfBlob(result);
      if (blob) return blob;
    }

    // Fallback: some export APIs return handles with toPromise()
    if (exportApi && typeof exportApi.saveAsCopy === 'function') {
      const handle = exportApi.saveAsCopy();
      const blob = await toPdfBlob(handle);
      if (blob) return blob;
    }

    return null;
  }, [hasRedactionSupport]);

  const handleApplyAndSave = useCallback(async () => {
    if (!selectedFile) {
      alert({
        alertType: 'error',
        title: t('redact.manual.noFileSelected', 'No PDF selected'),
        body: t('redact.manual.noFileSelectedBody', 'Select a PDF before opening the redaction editor.'),
      });
      return;
    }

    setIsApplying(true);
    try {
      const applied = await invokeRedactionMethodAsync([
        'applyRedactions',
        'applyPendingRedactions',
        'apply',
        'commit',
        'finalizeRedactions',
        'performRedactions',
      ]);

      if (!applied) {
        console.warn('[manual-redaction] No compatible apply method found');
      }

      const blob = await exportRedactedBlob();
      if (!blob) {
        throw new Error('Unable to export redacted PDF');
      }

      const outputName = buildRedactedFileName(selectedFile.name);
      const exportedFile = new File([blob], outputName, { type: 'application/pdf' });

      if (data?.onExport) {
        await data.onExport(exportedFile);
      }

      alert({
        alertType: 'success',
        title: t('redact.manual.exportSuccess', 'Redacted copy saved'),
        body: t('redact.manual.exportSuccessBody', 'A redacted PDF has been added to your files.'),
      });

      exitWorkbench();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('redact.manual.exportUnknownError', 'Failed to export redacted PDF.');
      alert({
        alertType: 'error',
        title: t('redact.manual.exportFailed', 'Export failed'),
        body: message,
      });
    } finally {
      setIsApplying(false);
    }
  }, [data, exitWorkbench, exportRedactedBlob, invokeRedactionMethodAsync, navigationActions, selectedFile, t]);

  useEffect(() => {
    if (!isReady || !hasRedactionSupport) return;
    return () => {
      setIsReady(false);
      redactionApiRef.current = null;
      exportApiRef.current = null;
      historyApiRef.current = null;
    };
  }, [hasRedactionSupport, isReady, objectUrl]);

  const rightRailButtons = useMemo<RightRailButtonWithAction[]>(() => ([
    {
      id: 'manual-redaction-area',
      icon: <CropFreeRoundedIcon fontSize="small" />,
      tooltip: t('redact.manual.buttons.area', 'Mark area for redaction'),
      ariaLabel: t('redact.manual.buttons.area', 'Mark area for redaction'),
      section: 'top',
      order: 0,
      disabled: !isReady || !hasRedactionSupport,
      className: activeType === 'marqueeRedact' ? 'right-rail-icon--active' : undefined,
      onClick: enableAreaRedaction,
    },
    {
      id: 'manual-redaction-text',
      icon: <TextFieldsRoundedIcon fontSize="small" />,
      tooltip: t('redact.manual.buttons.text', 'Mark text for redaction'),
      ariaLabel: t('redact.manual.buttons.text', 'Mark text for redaction'),
      section: 'top',
      order: 1,
      disabled: !isReady || !hasRedactionSupport,
      className: activeType === 'redactSelection' ? 'right-rail-icon--active' : undefined,
      onClick: enableTextRedaction,
    },
  ]), [enableAreaRedaction, enableTextRedaction, hasRedactionSupport, isReady, t, activeType]);

  useRightRailButtons(rightRailButtons);

  if (!selectedFile) {
    return (
      <Stack gap="md" p="lg" h="100%" align="center" justify="center">
        <Alert color="blue" variant="light">
          {t('redact.manual.selectFilePrompt', 'Select a single PDF from the sidebar to start manual redaction.')}
        </Alert>
      </Stack>
    );
  }

  if (isLoading || !engine || !pdfUrl) {
    return <ToolLoadingFallback toolName="Manual Redaction Viewer" />;
  }

  if (error) {
    return (
      <Stack gap="sm" align="center" justify="center" h="100%" p="xl">
        <Alert color="red" variant="light" title={t('redact.manual.loadFailed', 'Unable to open PDF')}>
          {error.message}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" h="100%" p="md" className="manual-redaction-workbench">
      <Group justify="space-between" align="center">
        <Stack gap={2}>
          <Text fw={600}>{t('redact.manual.editorHeading', 'Manual redaction')}</Text>
          <Text size="sm" c="dimmed">
            {t('redact.manual.editorSubheading', 'Draw rectangles or search for text to mark redactions, then apply the changes.')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('redact.manual.currentFile', 'Current file: {{name}}', { name: selectedFile.name })}
          </Text>
        </Stack>

        <Group gap="sm">
          <Button
            variant="default"
            onClick={exitWorkbench}
          >
            {t('redact.manual.exit', 'Back to files')}
          </Button>
          <Button
            variant="filled"
            color="blue"
            onClick={handleApplyAndSave}
            disabled={!isReady || isApplying}
            leftSection={isApplying ? <Loader size="xs" color="white" /> : undefined}
          >
            {isApplying
              ? t('redact.manual.applying', 'Applying…')
              : t('redact.manual.applyAndSave', 'Apply & save copy')}
          </Button>
        </Group>
      </Group>

      <Warning text={t('redact.manual.irreversible', 'Redaction is an irreversible process. Once committed, the original content is removed and cannot be restored from the document.')} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          position: 'relative',
          borderRadius: 0,
          overflow: 'hidden',
          boxShadow: 'none',
          backgroundColor: 'transparent',
        }}
      >
        <EmbedPDF
          engine={engine}
          plugins={plugins}
          onInitialized={handleInitialized}
        >
          <GlobalPointerProvider>
            <Viewport
              style={{
                backgroundColor: 'var(--bg-background)',
                height: '100%',
                width: '100%',
                maxHeight: '100%',
                maxWidth: '100%',
                overflow: 'auto',
                position: 'relative',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                contain: 'strict',
              }}
            >
              <Scroller
                renderPage={({ document, width, height, pageIndex, scale, rotation }) => (
                  <Rotate key={document?.id} pageSize={{ width, height }}>
                    <PagePointerProvider pageIndex={pageIndex} pageWidth={width} pageHeight={height} scale={scale} rotation={rotation}>
                      <div
                        style={{
                          width,
                          height,
                          position: 'relative',
                          overflow: 'visible',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                          backgroundColor: 'white',
                          cursor: activeType === 'marqueeRedact' ? 'crosshair' : activeType === 'redactSelection' ? 'text' : 'auto',
                        }}
                        draggable={false}
                        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      >
                        <TilingLayer pageIndex={pageIndex} scale={scale} />
                        <SelectionLayer pageIndex={pageIndex} scale={scale} />
                        {hasRedactionSupport && RedactionLayerComponent && (
                          <RedactionLayerComponent
                            pageIndex={pageIndex}
                            scale={scale}
                            rotation={rotation}
                            selectionMenu={(props: SelectionMenuProps) => <InlineRedactionMenu {...props} />}
                          />
                        )}
                      </div>
                    </PagePointerProvider>
                  </Rotate>
                )}
              />
            </Viewport>
          </GlobalPointerProvider>
        </EmbedPDF>
      </div>
    </Stack>
  );
};

export default ManualRedactionWorkbenchView;

// Inline redaction menu displayed beneath selection/rectangle
function InlineRedactionMenu(
  { item, selected, menuWrapperProps, rect }: SelectionMenuProps & { rect?: any }
) {
  const { provides } = useRedaction();
  const isVisible = Boolean(selected);

  // Measure wrapper to portal the menu to the document body so clicks aren't intercepted
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [screenRect, setScreenRect] = useState<{ left: number; top: number; height: number } | null>(null);
  const mergeRef = useCallback((node: any) => {
    wrapperRef.current = node;
    try {
      const r = (menuWrapperProps as any)?.ref;
      if (typeof r === 'function') r(node);
      else if (r && typeof r === 'object') (r as any).current = node;
    } catch {}
  }, [menuWrapperProps]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rectEl = el.getBoundingClientRect();
    setScreenRect({ left: rectEl.left, top: rectEl.top, height: rectEl.height || ((rect as any)?.size?.height ?? 0) });
  }, [item?.id, item?.page, isVisible]);

  const panel = (
    <div
      onPointerDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); }}
      onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); }}
      style={{
        position: 'fixed',
        left: (screenRect?.left ?? 0),
        top: (screenRect?.top ?? 0) + (screenRect?.height ?? 0) + 8,
        pointerEvents: 'auto',
        zIndex: 2147483647,
      }}
    >
      <Group gap="xs" p={6} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', cursor: 'default' }}>
        <Button size="xs" color="red" onClick={(e) => { e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); (provides?.commitAllPending?.() ?? provides?.commitPending?.(item.page, item.id)); }}>
          Apply
        </Button>
        <Button size="xs" variant="default" onClick={(e) => { e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); provides?.removePending?.(item.page, item.id); }}>
          Cancel
        </Button>
      </Group>
    </div>
  );

  const { ref: _ignoredRef, ...restWrapper } = (menuWrapperProps as any) || {};

  return (
    <>
      <div ref={mergeRef} {...restWrapper} />
      {isVisible && screenRect ? createPortal(panel, document.body) : null}
    </>
  );
}
