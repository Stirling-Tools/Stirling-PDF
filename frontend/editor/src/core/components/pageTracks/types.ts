import { FileId } from "@app/types/file";

/** Page size in PDF points, before the page's rotation is applied. */
export interface PageSize {
  width: number;
  height: number;
}

interface TrackPageBase extends PageSize {
  /** Per-instance; survives moves. */
  id: string;
  /** Absolute rotation in degrees. */
  rotation: number;
}

/**
 * A page copied from an open file. `sourceFileId`/`sourcePageNumber` point at
 * the bytes to copy on save, so a page dragged into another track still knows
 * where it came from. Its size is 0 x 0 when the file's metadata lacks it.
 */
export interface SourceTrackPage extends TrackPageBase {
  kind: "source";
  sourceFileId: FileId;
  sourcePageNumber: number;
  /** The source file's {@link TrackSource.contentKey} when this page was read. */
  sourceContentKey: string;
}

/** An empty page inserted in the editor, written out at its own size. */
export interface BlankTrackPage extends TrackPageBase {
  kind: "blank";
}

export type TrackPage = SourceTrackPage | BlankTrackPage;

export const isSourcePage = (page: TrackPage): page is SourceTrackPage =>
  page.kind === "source";

/**
 * One track of pages. `fileId` is the map key and order entry: a real active
 * file's id for a file-backed track, or a minted id for a split that has no
 * file yet. `isNew` tells them apart — a split is written to a brand-new file
 * on save, a file-backed track versions its own file.
 */
export interface Track {
  fileId: FileId;
  /** Display name: the file's name, or a derived one for a split. */
  name: string;
  /** True for a split not yet backed by a saved file. */
  isNew: boolean;
  /** For a split, the file it was cut from: parents the saved file when no
   *  source page is left to, as in a split of blank pages. */
  splitFromFileId?: FileId;
  pages: TrackPage[];
}

export interface TrackWorkspace {
  order: FileId[];
  tracks: Record<FileId, Track>;
}

/** Page counts + rotation baselines for the files a sync should cover. */
export interface TrackSource {
  fileId: FileId;
  name: string;
  pageCount: number;
  rotations: number[];
  /** Per page; 0 x 0 where the file's metadata does not record it. */
  sizes: PageSize[];
  /**
   * Changes when the file's bytes are replaced under an unchanged id, which a
   * disk reload does without necessarily moving the page count or rotations.
   */
  contentKey: string;
}

/** Cache key for a source page's thumbnail, shared by every instance of it. */
export const sourcePageKey = (page: SourceTrackPage): string =>
  `${page.sourceFileId}@${page.sourceContentKey}#${page.sourcePageNumber}`;

export const trackSignature = (pages: TrackPage[]): string =>
  pages
    .map((p) =>
      isSourcePage(p)
        ? `${p.sourceFileId}:${p.sourcePageNumber}:${p.rotation}`
        : `blank:${p.id}:${p.rotation}`,
    )
    .join("|");

export const emptyWorkspace: TrackWorkspace = { order: [], tracks: {} };

export const allPages = (workspace: TrackWorkspace): TrackPage[] =>
  workspace.order.flatMap((fileId) => workspace.tracks[fileId]?.pages ?? []);

export const totalPageCount = (workspace: TrackWorkspace): number =>
  workspace.order.reduce(
    (sum, fileId) => sum + (workspace.tracks[fileId]?.pages.length ?? 0),
    0,
  );
