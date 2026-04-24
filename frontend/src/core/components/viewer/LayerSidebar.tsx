import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  ScrollArea,
  Text,
  Checkbox,
  Stack,
  Loader,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import LayersIcon from "@mui/icons-material/Layers";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import "@app/components/viewer/SidebarBase.css";
import "@app/components/viewer/LayerSidebar.css";
import {
  readPdfLayers,
  applyOCGVisibilityToPdf,
  collectLeafIds,
} from "@app/components/viewer/layerUtils";

import type { LayerInfo } from "@app/components/viewer/layerUtils";
export type { LayerInfo };

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

const SIDEBAR_WIDTH = "15rem";

type LoadStatus = "idle" | "loading" | "ready" | "no-layers" | "error";

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
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const loadedKeyRef = useRef<string | null>(null);
  // Track whether visibility was set by user interaction (not initial load)
  const userChangedRef = useRef(false);

  // Load layers when the document changes
  useEffect(() => {
    if (!file || !documentCacheKey) {
      setStatus("idle");
      setLayers([]);
      setVisibility({});
      loadedKeyRef.current = null;
      userChangedRef.current = false;
      onLayersDetected?.(false);
      return;
    }

    if (loadedKeyRef.current === documentCacheKey) return;

    setStatus("loading");
    setLoadError(null);
    userChangedRef.current = false;

    let cancelled = false;

    readPdfLayers(file)
      .then((layerList) => {
        if (cancelled) return;

        if (layerList.length === 0) {
          setStatus("no-layers");
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
        setStatus("ready");
        loadedKeyRef.current = documentCacheKey;
        onLayersDetected?.(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setLoadError(
          err instanceof Error ? err.message : "Failed to read PDF layers",
        );
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
    if (!userChangedRef.current || !file || isApplying || layers.length === 0)
      return;

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
        const modifiedBytes = await applyOCGVisibilityToPdf(
          arrayBuffer,
          nameVisibility,
        );
        const blob = new Blob([new Uint8Array(modifiedBytes)], {
          type: "application/pdf",
        });

        await onApplyLayers(blob);
      } catch (err) {
        console.error("[LayerSidebar] Failed to apply layer changes:", err);
      } finally {
        setIsApplying(false);
        userChangedRef.current = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [visibility, file, layers, isApplying, onApplyLayers]);

  const toggleLayerVisibility = useCallback((id: string) => {
    userChangedRef.current = true;
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const showAll = useCallback(() => {
    userChangedRef.current = true;
    setVisibility((prev) => {
      const updated: Record<string, boolean> = {};
      for (const id of Object.keys(prev)) {
        updated[id] = true;
      }
      return updated;
    });
  }, []);

  const hideAll = useCallback(() => {
    userChangedRef.current = true;
    setVisibility((prev) => {
      const updated: Record<string, boolean> = {};
      for (const id of Object.keys(prev)) {
        updated[id] = false;
      }
      return updated;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const renderLayer = (layer: LayerInfo & { depth: number }) => {
    const hasChildren = Boolean(layer.children && layer.children.length > 0);
    const isExpanded = expanded[layer.id] !== false; // default expanded
    const isLeaf = !hasChildren;

    const isVisible = isLeaf
      ? (visibility[layer.id] ?? layer.visible)
      : collectLeafIds(layer.children ?? []).every(
          (id) => visibility[id] ?? true,
        );

    return (
      <div
        key={layer.id}
        className="layer-item-wrapper"
        style={{
          marginLeft: layer.depth > 0 ? `${layer.depth * 0.875}rem` : "0",
        }}
      >
        <div
          className={`layer-item ${!isVisible ? "layer-item--hidden" : ""}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(layer.id);
            } else {
              toggleLayerVisibility(layer.id);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
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
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(layer.id);
              }}
            >
              {isExpanded ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M2 4l4 4 4-4z" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
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
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0 }}
            />
          )}

          <Tooltip
            label={layer.name}
            position="left"
            withinPortal
            disabled={layer.name.length < 20}
          >
            <span className="layer-item__label">{layer.name}</span>
          </Tooltip>
        </div>

        {hasChildren && isExpanded && (
          <div className="layer-item__children">
            {(layer.children ?? []).map((child) =>
              renderLayer({ ...child, depth: 0 }),
            )}
          </div>
        )}
      </div>
    );
  };

  if (!visible) return null;

  const leafIds = collectLeafIds(layers);
  const allVisible = leafIds.every((id) => visibility[id] !== false);
  const allHidden = leafIds.every((id) => visibility[id] === false);

  return (
    <Box
      className="sidebar-base layer-sidebar"
      style={{
        position: "fixed",
        right: `${rightOffset}rem`,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      {/* Header */}
      <div className="sidebar-base__header">
        <div className="sidebar-base__header-title">
          <span className="sidebar-base__header-icon">
            <LayersIcon fontSize="small" />
          </span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5} style={{ flex: 1 }}>
            Layers
          </Text>
          {isApplying && <Loader size="xs" type="dots" />}
        </div>

        {status === "ready" && leafIds.length > 0 && (
          <div className="layer-sidebar__header-actions">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={showAll}
              disabled={allVisible || isApplying}
              aria-label="Show all layers"
              title="Show all"
            >
              <VisibilityIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={hideAll}
              disabled={allHidden || isApplying}
              aria-label="Hide all layers"
              title="Hide all"
            >
              <VisibilityOffIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="sidebar-base__content">
          {status === "idle" && (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Open a PDF to view its layers.
              </Text>
            </div>
          )}

          {status === "loading" && (
            <Stack
              gap="md"
              align="center"
              c="dimmed"
              py="xl"
              className="sidebar-base__loading"
            >
              <Loader size="md" type="dots" />
              <Text size="sm" ta="center">
                Loading layers...
              </Text>
            </Stack>
          )}

          {status === "error" && (
            <div className="sidebar-base__error">
              <Text size="sm" c="red" ta="center">
                {loadError ?? "Failed to load layers."}
              </Text>
            </div>
          )}

          {status === "no-layers" && (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                This document has no layers.
              </Text>
            </div>
          )}

          {status === "ready" && layers.length > 0 && (
            <div className="layer-list">
              {layers.map((layer) => renderLayer({ ...layer, depth: 0 }))}
            </div>
          )}
        </Box>
      </ScrollArea>
    </Box>
  );
}
