import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ToolId } from "@app/types/toolId";

/**
 * Hands a subtool preset (see toolSubtools) from whoever opens a tool — search,
 * a `?preset=` link — to the tool itself. Tool settings are local state that
 * only exists once the tool mounts (often lazily), so the request is held here
 * until that tool's consumer takes it.
 */
interface ToolPresetRequest {
  toolId: ToolId;
  slug: string;
}

let pending: ToolPresetRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask `toolId` to apply the preset `slug` when it is (or already is) open. */
export function requestToolPreset(toolId: ToolId, slug: string): void {
  // A fresh object each time, so asking for the same preset again re-applies it.
  pending = { toolId, slug };
  emit();
}

/** Drop a request meant for any tool other than `keepToolId` (e.g. after switching away). */
export function clearToolPresetRequest(keepToolId?: ToolId | null): void {
  if (!pending || pending.toolId === keepToolId) return;
  pending = null;
  emit();
}

/**
 * Applies requests meant for `toolId`, once each: on mount for one made while
 * the tool was loading, and immediately for one made while it is open.
 */
export function useToolPresetRequest(
  toolId: ToolId,
  apply: (slug: string) => void,
): void {
  const request = useSyncExternalStore(subscribe, () => pending);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    if (!request || request.toolId !== toolId) return;
    pending = null;
    applyRef.current(request.slug);
    emit();
  }, [request, toolId]);
}
