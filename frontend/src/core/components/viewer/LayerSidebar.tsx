import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, ScrollArea, Text, Checkbox, Stack, Loader, ActionIcon, Tooltip } from '@mantine/core';
import LayersIcon from '@mui/icons-material/Layers';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import '@app/components/viewer/LayerSidebar.css';

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  children?: LayerInfo[];
}

interface LayerSidebarProps {
  visible: boolean;
  /** Right offset in rem (how far from the right edge). */
  rightOffset: number;
  /** The current PDF file to read layers from. */
  file?: Blob | null;
  /** Stable key that changes when the document changes (used to avoid re-fetching). */
  documentCacheKey?: string;
  /** Called when the user applies layer visibility changes. Receives the modified PDF blob. */
  onApplyLayers: (modifiedBlob: Blob) => Promise<void>;
  /** Called when layer detection completes, reporting whether the PDF has layers. */
  onLayersDetected?: (hasLayers: boolean) => void;
}

const SIDEBAR_WIDTH = '15rem';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'no-layers' | 'error';

/**
 * Reads OCG layer info from a PDF file using pdfjs-dist.
 * Returns a flat list of all OCG groups with their names and default visibility.
 */
async function readPdfLayers(file: Blob): Promise<LayerInfo[]> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: arrayBuffer, verbosity: 0 });
  const pdfDoc = await loadingTask.promise;

  try {
    const ocConfig = await pdfDoc.getOptionalContentConfig();

    if (!ocConfig) return [];

    // pdfjs v5 uses [Symbol.iterator] and getGroup(id), not getGroups()
    const groups: Record<string, any> = {};
    for (const [id, group] of ocConfig as any) {
      groups[id] = group;
    }
    if (Object.keys(groups).length === 0) return [];

    // Use getOrder() for hierarchical display
    let order: any[] | null = null;
    try {
      order = ocConfig.getOrder?.() ?? null;
    } catch {
      // getOrder not available
    }

    if (order && Array.isArray(order) && order.length > 0) {
      return buildLayerTree(order, groups);
    }

    // Fallback: flat list in enumeration order
    return Object.entries(groups).map(([id, group]) => ({
      id,
      name: (group as any).name ?? id,
      visible: (group as any).visible ?? true,
    }));
  } finally {
    await pdfDoc.destroy();
  }
}

/**
 * Recursively builds a LayerInfo tree from pdfjs OCG order array.
 * The order array can contain:
 *  - string: an OCG id
 *  - { name: string, order: any[] }: a named group with children
 *  - array: a nested group
 */
function buildLayerTree(
  order: any[],
  groups: Record<string, any>,
  visited = new Set<string>()
): LayerInfo[] {
  const result: LayerInfo[] = [];

  for (const item of order) {
    if (typeof item === 'string') {
      // It's an OCG id
      if (visited.has(item)) continue;
      visited.add(item);
      const group = groups[item];
      if (group) {
        result.push({
          id: item,
          name: (group as any).name ?? item,
          visible: (group as any).visible ?? true,
        });
      }
    } else if (Array.isArray(item)) {
      // Nested group (unlabeled)
      const children = buildLayerTree(item, groups, visited);
      result.push(...children);
    } else if (item && typeof item === 'object') {
      // Named group with nested items
      const { name, order: subOrder } = item as { name?: string; order?: any[] };
      const children = subOrder ? buildLayerTree(subOrder, groups, visited) : [];
      if (name && children.length > 0) {
        // Use the first child's id as a synthetic group id
        result.push({
          id: `group-${name}`,
          name: name,
          visible: children.every(c => c.visible),
          children,
        });
      } else {
        result.push(...children);
      }
    }
  }

  return result;
}

/**
 * Modifies OCG visibility in a PDF using @cantoo/pdf-lib.
 * Accepts a flat map of { layerName -> visible } and rewrites the /D config.
 *
 * Strategy: set /BaseState to /OFF and only list visible layers in /ON.
 * This is the most unambiguous approach and avoids conflicts between
 * /BaseState, /ON, and /OFF that can confuse some viewers.
 * Also removes /AS (auto-state) entries that can override visibility.
 */
async function applyOCGVisibilityToPdf(
  pdfBytes: ArrayBuffer,
  layerVisibility: Record<string, boolean>
): Promise<Uint8Array> {
  const { PDFDocument, PDFDict, PDFName, PDFArray, PDFString, PDFHexString } =
    await import('@cantoo/pdf-lib');

  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const context = doc.context;

  // Access the catalog via the trailer's Root reference
  const catalogRef = context.trailerInfo.Root;
  const catalog = context.lookup(catalogRef) as unknown as typeof PDFDict.prototype;

  // Get OCProperties dict (may be a direct dict or an indirect reference)
  const ocPropsRaw = (catalog as any).lookup(PDFName.of('OCProperties'));
  if (!ocPropsRaw) {
    return doc.save();
  }
  const ocProps = (ocPropsRaw instanceof PDFDict
    ? ocPropsRaw
    : context.lookup(ocPropsRaw)) as unknown as typeof PDFDict.prototype;

  // Get the /OCGs array
  const ocgsRaw = (ocProps as any).lookup(PDFName.of('OCGs'));
  if (!(ocgsRaw instanceof PDFArray)) {
    return doc.save();
  }
  const ocgsArray = ocgsRaw as unknown as typeof PDFArray.prototype;

  // Get or create the /D (default config) dict
  const dRaw = (ocProps as any).lookup(PDFName.of('D'));
  if (!dRaw) {
    return doc.save();
  }
  const dDict = (dRaw instanceof PDFDict
    ? dRaw
    : context.lookup(dRaw)) as unknown as typeof PDFDict.prototype;

  // Collect OCG refs for ON vs OFF based on user visibility settings
  const onRefs: any[] = [];
  const offRefs: any[] = [];

  const size = (ocgsArray as any).size() as number;
  for (let i = 0; i < size; i++) {
    const ocgRef = (ocgsArray as any).get(i);
    const ocgDict = context.lookup(ocgRef) as unknown as typeof PDFDict.prototype;
    if (!ocgDict) continue;

    // Get the OCG name
    const nameRaw = (ocgDict as any).lookup(PDFName.of('Name'));
    let ocgName = '';
    if (nameRaw instanceof PDFString || nameRaw instanceof PDFHexString) {
      ocgName = (nameRaw as any).decodeText?.() ?? (nameRaw as any).asString?.() ?? '';
    } else if (nameRaw) {
      ocgName = String(nameRaw);
    }

    // Look up visibility by name
    const shouldBeVisible = layerVisibility[ocgName] ?? true;

    if (shouldBeVisible) {
      onRefs.push(ocgRef);
    } else {
      offRefs.push(ocgRef);
    }
  }

  // Set /BaseState to /OFF so all layers start hidden, then /ON lists visible ones.
  // This is unambiguous and avoids conflicts between /BaseState and /ON//OFF.
  (dDict as any).set(PDFName.of('BaseState'), PDFName.of('OFF'));

  // Set /ON to only the visible layers
  if (onRefs.length > 0) {
    (dDict as any).set(PDFName.of('ON'), context.obj(onRefs));
  } else {
    (dDict as any).delete?.(PDFName.of('ON'));
  }

  // Set /OFF to only the hidden layers (for viewers that check it)
  if (offRefs.length > 0) {
    (dDict as any).set(PDFName.of('OFF'), context.obj(offRefs));
  } else {
    (dDict as any).delete?.(PDFName.of('OFF'));
  }

  // Remove /AS (auto-state) array — it can contain usage-based overrides
  // (e.g., print vs view) that conflict with our explicit visibility settings.
  (dDict as any).delete?.(PDFName.of('AS'));

  return doc.save();
}

/**
 * Collects all leaf-level layer IDs (those that are actual OCGs, not synthetic groups).
 */
function collectLeafIds(layers: LayerInfo[]): string[] {
  const ids: string[] = [];
  for (const layer of layers) {
    if (layer.children && layer.children.length > 0) {
      ids.push(...collectLeafIds(layer.children));
    } else {
      ids.push(layer.id);
    }
  }
  return ids;
}

export function LayerSidebar({
  visible,
  rightOffset,
  file,
  documentCacheKey,
  onApplyLayers,
  onLayersDetected,
}: LayerSidebarProps) {
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const loadedKeyRef = useRef<string | null>(null);
  // Track whether visibility was set by user interaction (not initial load)
  const userChangedRef = useRef(false);

  // Load layers when the document changes
  useEffect(() => {
    if (!file || !documentCacheKey) {
      setStatus('idle');
      setLayers([]);
      setVisibility({});
      loadedKeyRef.current = null;
      userChangedRef.current = false;
      onLayersDetected?.(false);
      return;
    }

    if (loadedKeyRef.current === documentCacheKey) return;

    setStatus('loading');
    setLoadError(null);
    userChangedRef.current = false;

    let cancelled = false;

    readPdfLayers(file)
      .then(layerList => {
        if (cancelled) return;

        if (layerList.length === 0) {
          setStatus('no-layers');
          setLayers([]);
          setVisibility({});
          loadedKeyRef.current = documentCacheKey;
          onLayersDetected?.(false);
          return;
        }

        // Build visibility map from the layer defaults (all leaf IDs)
        const visMap: Record<string, boolean> = {};
        const populateVisibility = (items: LayerInfo[]) => {
          for (const item of items) {
            if (item.children && item.children.length > 0) {
              populateVisibility(item.children);
            } else {
              visMap[item.id] = item.visible;
            }
          }
        };
        populateVisibility(layerList);

        setLayers(layerList);
        setVisibility(visMap);
        setStatus('ready');
        loadedKeyRef.current = documentCacheKey;
        onLayersDetected?.(true);
      })
      .catch(err => {
        if (cancelled) return;
        setStatus('error');
        setLoadError(err instanceof Error ? err.message : 'Failed to read PDF layers');
        onLayersDetected?.(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, documentCacheKey, onLayersDetected]);

  // Reset when document changes
  useEffect(() => {
    setExpanded({});
    userChangedRef.current = false;
  }, [documentCacheKey]);

  // Auto-apply: debounce visibility changes from user interaction
  useEffect(() => {
    if (!userChangedRef.current || !file || isApplying || layers.length === 0) return;

    const timer = setTimeout(async () => {
      setIsApplying(true);
      try {
        const nameVisibility: Record<string, boolean> = {};
        const collectNames = (items: LayerInfo[]) => {
          for (const item of items) {
            if (item.children && item.children.length > 0) {
              collectNames(item.children);
            } else {
              nameVisibility[item.name] = visibility[item.id] ?? item.visible;
            }
          }
        };
        collectNames(layers);

        const arrayBuffer = await file.arrayBuffer();
        const modifiedBytes = await applyOCGVisibilityToPdf(arrayBuffer, nameVisibility);
        const blob = new Blob([modifiedBytes], { type: 'application/pdf' });

        await onApplyLayers(blob);
      } catch (err) {
        console.error('[LayerSidebar] Failed to apply layer changes:', err);
      } finally {
        setIsApplying(false);
        userChangedRef.current = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [visibility, file, layers, isApplying, onApplyLayers]);

  const toggleLayerVisibility = useCallback((id: string) => {
    userChangedRef.current = true;
    setVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const showAll = useCallback(() => {
    userChangedRef.current = true;
    setVisibility(prev => {
      const updated: Record<string, boolean> = {};
      for (const id of Object.keys(prev)) {
        updated[id] = true;
      }
      return updated;
    });
  }, []);

  const hideAll = useCallback(() => {
    userChangedRef.current = true;
    setVisibility(prev => {
      const updated: Record<string, boolean> = {};
      for (const id of Object.keys(prev)) {
        updated[id] = false;
      }
      return updated;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const renderLayer = (layer: LayerInfo & { depth: number }) => {
    const hasChildren = Boolean(layer.children && layer.children.length > 0);
    const isExpanded = expanded[layer.id] !== false; // default expanded
    const isLeaf = !hasChildren;

    const isVisible = isLeaf
      ? visibility[layer.id] ?? layer.visible
      : collectLeafIds(layer.children ?? []).every(id => visibility[id] ?? true);

    return (
      <div
        key={layer.id}
        className="layer-item-wrapper"
        style={{ marginLeft: layer.depth > 0 ? `${layer.depth * 0.875}rem` : '0' }}
      >
        <div
          className={`layer-item ${!isVisible ? 'layer-item--hidden' : ''}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(layer.id);
            } else {
              toggleLayerVisibility(layer.id);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (hasChildren) {
                toggleExpanded(layer.id);
              } else {
                toggleLayerVisibility(layer.id);
              }
            }
          }}
        >
          {hasChildren ? (
            <span
              className="layer-item__expand-btn"
              onClick={e => {
                e.stopPropagation();
                toggleExpanded(layer.id);
              }}
            >
              {isExpanded ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4l4 4 4-4z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4 2l4 4-4 4z" />
                </svg>
              )}
            </span>
          ) : (
            <span className="layer-item__expand-placeholder" />
          )}

          {isLeaf && (
            <Checkbox
              size="xs"
              checked={visibility[layer.id] ?? layer.visible}
              onChange={() => toggleLayerVisibility(layer.id)}
              onClick={e => e.stopPropagation()}
              style={{ flexShrink: 0 }}
            />
          )}

          <Tooltip
            label={layer.name}
            position="left"
            withinPortal
            disabled={layer.name.length < 20}
          >
            <span className="layer-item__label">
              {layer.name}
            </span>
          </Tooltip>
        </div>

        {hasChildren && isExpanded && (
          <div className="layer-item__children">
            {(layer.children ?? []).map(child => renderLayer({ ...child, depth: 0 }))}
          </div>
        )}
      </div>
    );
  };

  if (!visible) return null;

  const leafIds = collectLeafIds(layers);
  const allVisible = leafIds.every(id => visibility[id] !== false);
  const allHidden = leafIds.every(id => visibility[id] === false);

  return (
    <Box
      className="layer-sidebar"
      style={{
        position: 'fixed',
        right: `${rightOffset}rem`,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      {/* Header */}
      <div className="layer-sidebar__header">
        <div className="layer-sidebar__header-title">
          <span className="layer-sidebar__header-icon">
            <LayersIcon fontSize="small" />
          </span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5} style={{ flex: 1 }}>
            Layers
          </Text>
          {isApplying && <Loader size="xs" type="dots" />}
        </div>

        {status === 'ready' && leafIds.length > 0 && (
          <div className="layer-sidebar__header-actions">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={showAll}
              disabled={allVisible || isApplying}
              aria-label="Show all layers"
              title="Show all"
            >
              <VisibilityIcon sx={{ fontSize: '1rem' }} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={hideAll}
              disabled={allHidden || isApplying}
              aria-label="Hide all layers"
              title="Hide all"
            >
              <VisibilityOffIcon sx={{ fontSize: '1rem' }} />
            </ActionIcon>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="layer-sidebar__content">
          {status === 'idle' && (
            <div className="layer-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Open a PDF to view its layers.
              </Text>
            </div>
          )}

          {status === 'loading' && (
            <Stack gap="md" align="center" c="dimmed" py="xl" className="layer-sidebar__loading">
              <Loader size="md" type="dots" />
              <Text size="sm" ta="center">
                Loading layers...
              </Text>
            </Stack>
          )}

          {status === 'error' && (
            <div className="layer-sidebar__error">
              <Text size="sm" c="red" ta="center">
                {loadError ?? 'Failed to load layers.'}
              </Text>
            </div>
          )}

          {status === 'no-layers' && (
            <div className="layer-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                This document has no layers.
              </Text>
            </div>
          )}

          {status === 'ready' && layers.length > 0 && (
            <div className="layer-list">
              {layers.map(layer => renderLayer({ ...layer, depth: 0 }))}
            </div>
          )}
        </Box>
      </ScrollArea>

    </Box>
  );
}
