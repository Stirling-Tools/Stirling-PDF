import { FileId } from "@app/types/file";

/**
 * One page instance inside a track. `sourceFileId`/`sourcePageNumber` point at
 * the bytes to copy on save, so a page dragged into another track still knows
 * where it came from. `id` is per-instance and survives moves.
 */
export interface TrackPage {
  id: string;
  sourceFileId: FileId;
  sourcePageNumber: number;
  /** Absolute rotation in degrees, seeded from the source page's /Rotate. */
  rotation: number;
}

/** One open PDF, expanded into the pages that will be written back to it. */
export interface Track {
  fileId: FileId;
  pages: TrackPage[];
}

export interface TrackWorkspace {
  order: FileId[];
  tracks: Record<FileId, Track>;
}

/** Page counts + rotation baselines for the files a sync should cover. */
export interface TrackSource {
  fileId: FileId;
  pageCount: number;
  rotations: number[];
}

/** Cache key for a source page's thumbnail, shared by every instance of it. */
export const sourcePageKey = (page: TrackPage): string =>
  `${page.sourceFileId}#${page.sourcePageNumber}`;

export const trackSignature = (pages: TrackPage[]): string =>
  pages
    .map((p) => `${p.sourceFileId}:${p.sourcePageNumber}:${p.rotation}`)
    .join("|");

export const emptyWorkspace: TrackWorkspace = { order: [], tracks: {} };

export const allPages = (workspace: TrackWorkspace): TrackPage[] =>
  workspace.order.flatMap((fileId) => workspace.tracks[fileId]?.pages ?? []);

export const totalPageCount = (workspace: TrackWorkspace): number =>
  workspace.order.reduce(
    (sum, fileId) => sum + (workspace.tracks[fileId]?.pages.length ?? 0),
    0,
  );
