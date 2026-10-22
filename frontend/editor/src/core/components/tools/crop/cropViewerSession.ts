import { useSyncExternalStore } from "react";
import type { Rectangle } from "@app/utils/cropCoordinates";
import type { CropPageGeometry } from "@app/utils/cropPageGeometry";

/**
 * Live crop state shared between the crop tool panel and the viewer overlay.
 * The panel owns the parameters; the overlay is a second surface over the real
 * document, so both need one source of truth and one writer.
 */
export interface CropViewerSession {
  geometry: CropPageGeometry;
  /** Page the geometry belongs to; the preview may lag behind the viewer. */
  geometryPageNumber: number;
  cropArea: Rectangle;
  pageNumber: number;
  aspectRatio: number | null;
  applyArea: (area: Rectangle, geometry: CropPageGeometry) => void;
  onPageChange: (page: number) => void;
}

export const CROP_SURFACE_STORAGE_KEY = "stirling.crop.surface";

export type CropSurfaceMode = "viewer" | "embedded";

export function readCropSurfaceMode(): CropSurfaceMode {
  try {
    return window.localStorage.getItem(CROP_SURFACE_STORAGE_KEY) === "embedded"
      ? "embedded"
      : "viewer";
  } catch {
    return "viewer";
  }
}

export function setCropSurfaceMode(mode: CropSurfaceMode): void {
  try {
    window.localStorage.setItem(CROP_SURFACE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or sandboxed contexts.
  }
}

export function useCropSurfaceMode(): CropSurfaceMode {
  const subscribe = (onChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CROP_SURFACE_STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  };
  return useSyncExternalStore(subscribe, readCropSurfaceMode, () => "viewer");
}

let currentSession: CropViewerSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCropViewerSession(session: CropViewerSession | null): void {
  currentSession = session;
  emit();
}

export function useCropViewerSession(): CropViewerSession | null {
  return useSyncExternalStore(
    subscribe,
    () => currentSession,
    () => null,
  );
}
