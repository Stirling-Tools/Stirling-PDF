import { FileId } from "@app/types/file";
import {
  Track,
  TrackPage,
  TrackSource,
  TrackWorkspace,
  emptyWorkspace,
  trackSignature,
} from "@app/components/pageTracks/types";

const MAX_HISTORY = 100;

export interface TrackEditorState {
  present: TrackWorkspace;
  /** Last saved (or freshly synced) state: what "dirty" is measured against. */
  baseline: TrackWorkspace;
  /** Per-file `pageCount:rotations` fingerprint, so an outside edit rebuilds. */
  sourceSignatures: Record<FileId, string>;
  past: TrackWorkspace[];
  future: TrackWorkspace[];
  /** Monotonic page-id counter, held in state to keep the reducer pure. */
  seq: number;
}

export type TrackEditorAction =
  | { type: "sync"; sources: TrackSource[] }
  | { type: "rotate"; pageIds: string[]; delta: number }
  | { type: "delete"; pageIds: string[] }
  | {
      type: "move";
      pageIds: string[];
      targetFileId: FileId;
      /** Insert before this page, or append when null. */
      beforePageId: string | null;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

export const initialTrackEditorState: TrackEditorState = {
  present: emptyWorkspace,
  baseline: emptyWorkspace,
  sourceSignatures: {},
  past: [],
  future: [],
  seq: 0,
};

const sourceSignature = (source: TrackSource): string =>
  `${source.pageCount}:${source.rotations.join(",")}`;

function buildTrack(source: TrackSource, seq: number): [Track, number] {
  const pages: TrackPage[] = [];
  let next = seq;
  for (let i = 0; i < source.pageCount; i++) {
    pages.push({
      id: `tp-${next++}`,
      sourceFileId: source.fileId,
      sourcePageNumber: i + 1,
      rotation: normalizeRotation(source.rotations[i] ?? 0),
    });
  }
  return [{ fileId: source.fileId, pages }, next];
}

export const normalizeRotation = (degrees: number): number =>
  (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;

/** Applies `mutate` to every track, dropping unchanged tracks by reference. */
function mapTracks(
  workspace: TrackWorkspace,
  mutate: (pages: TrackPage[], fileId: FileId) => TrackPage[],
): TrackWorkspace {
  let changed = false;
  const tracks: Record<FileId, Track> = {};
  for (const fileId of workspace.order) {
    const track = workspace.tracks[fileId];
    if (!track) continue;
    const pages = mutate(track.pages, fileId);
    if (pages === track.pages) {
      tracks[fileId] = track;
    } else {
      tracks[fileId] = { ...track, pages };
      changed = true;
    }
  }
  return changed ? { order: workspace.order, tracks } : workspace;
}

function withEdit(
  state: TrackEditorState,
  next: TrackWorkspace,
): TrackEditorState {
  if (next === state.present) return state;
  return {
    ...state,
    present: next,
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    future: [],
  };
}

function syncSources(
  state: TrackEditorState,
  sources: TrackSource[],
): TrackEditorState {
  const signatures: Record<FileId, string> = {};
  sources.forEach((source) => {
    signatures[source.fileId] = sourceSignature(source);
  });

  const order = sources.map((s) => s.fileId);
  const orderUnchanged =
    order.length === state.present.order.length &&
    order.every((id, i) => state.present.order[i] === id);
  const signaturesUnchanged = order.every(
    (id) => state.sourceSignatures[id] === signatures[id],
  );
  if (orderUnchanged && signaturesUnchanged) return state;

  // A pure permutation (dragging tracks around) touches no page, so the undo
  // history stays valid: only a changed FILE SET can leave an entry pointing at
  // pages that no longer exist.
  const sameFileSet =
    order.length === state.present.order.length &&
    order.every((id) => state.present.tracks[id] != null);
  if (sameFileSet && signaturesUnchanged) {
    return {
      ...state,
      present: { order, tracks: state.present.tracks },
      baseline: { order, tracks: state.baseline.tracks },
      sourceSignatures: signatures,
    };
  }

  const liveIds = new Set(order);
  let seq = state.seq;
  const tracks: Record<FileId, Track> = {};
  const baselineTracks: Record<FileId, Track> = {};

  for (const source of sources) {
    const existing = state.present.tracks[source.fileId];
    const rebuild =
      !existing ||
      state.sourceSignatures[source.fileId] !== signatures[source.fileId];
    if (rebuild) {
      // A file that just opened, or whose bytes changed underneath us, starts
      // from its own pages again, so any pending edit to it is void.
      const [track, nextSeq] = buildTrack(source, seq);
      seq = nextSeq;
      tracks[source.fileId] = track;
      baselineTracks[source.fileId] = track;
    } else {
      tracks[source.fileId] = existing;
      // Keep the old baseline so opening another file doesn't silently mark
      // pending edits as saved.
      baselineTracks[source.fileId] =
        state.baseline.tracks[source.fileId] ?? existing;
    }
  }

  // A closed file's bytes are gone, so pages it sourced can't be saved anywhere.
  const dropDeadSources = (pages: TrackPage[]) => {
    const kept = pages.filter((p) => liveIds.has(p.sourceFileId));
    return kept.length === pages.length ? pages : kept;
  };
  const present = mapTracks({ order, tracks }, dropDeadSources);

  return {
    present,
    baseline: { order, tracks: baselineTracks },
    sourceSignatures: signatures,
    // Undo entries can reference pages from files that are no longer open, and
    // restoring one would leave a page that cannot be saved. Drop the history.
    past: [],
    future: [],
    seq,
  };
}

export function trackEditorReducer(
  state: TrackEditorState,
  action: TrackEditorAction,
): TrackEditorState {
  switch (action.type) {
    case "sync":
      return syncSources(state, action.sources);

    case "rotate": {
      if (action.pageIds.length === 0 || action.delta === 0) return state;
      const ids = new Set(action.pageIds);
      const next = mapTracks(state.present, (pages) => {
        if (!pages.some((p) => ids.has(p.id))) return pages;
        return pages.map((p) =>
          ids.has(p.id)
            ? { ...p, rotation: normalizeRotation(p.rotation + action.delta) }
            : p,
        );
      });
      return withEdit(state, next);
    }

    case "delete": {
      if (action.pageIds.length === 0) return state;
      const ids = new Set(action.pageIds);
      const next = mapTracks(state.present, (pages) => {
        const kept = pages.filter((p) => !ids.has(p.id));
        return kept.length === pages.length ? pages : kept;
      });
      return withEdit(state, next);
    }

    case "move": {
      const { pageIds, targetFileId, beforePageId } = action;
      if (pageIds.length === 0) return state;
      const target = state.present.tracks[targetFileId];
      if (!target) return state;

      const moving = new Set(pageIds);
      // Take the pages in workspace order so a multi-select keeps its sequence.
      const moved: TrackPage[] = [];
      for (const fileId of state.present.order) {
        for (const page of state.present.tracks[fileId]?.pages ?? []) {
          if (moving.has(page.id)) moved.push(page);
        }
      }
      if (moved.length === 0) return state;

      // Resolve the anchor against the track as it stands now, skipping over
      // the pages being moved: the anchor is often one of them (dropping a
      // selection onto itself), and it will not exist after the strip below.
      const anchorId = resolveAnchor(target.pages, beforePageId, moving);

      const stripped = mapTracks(state.present, (pages) => {
        const kept = pages.filter((p) => !moving.has(p.id));
        return kept.length === pages.length ? pages : kept;
      });

      const targetPages = stripped.tracks[targetFileId]?.pages ?? [];
      const anchorIndex =
        anchorId == null
          ? targetPages.length
          : targetPages.findIndex((p) => p.id === anchorId);
      const insertAt = anchorIndex === -1 ? targetPages.length : anchorIndex;

      const nextTargetPages = [
        ...targetPages.slice(0, insertAt),
        ...moved,
        ...targetPages.slice(insertAt),
      ];

      const next: TrackWorkspace = {
        order: stripped.order,
        tracks: {
          ...stripped.tracks,
          [targetFileId]: {
            ...stripped.tracks[targetFileId],
            pages: nextTargetPages,
          },
        },
      };

      if (trackSignaturesMatch(state.present, next)) return state;
      return withEdit(state, next);
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future].slice(0, MAX_HISTORY),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        present: next,
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        future: rest,
      };
    }

    case "reset":
      return {
        ...state,
        present: state.baseline,
        past: [],
        future: [],
      };

    default:
      return state;
  }
}

/**
 * The first page at or after `beforePageId` that is not itself being moved, or
 * null to append. Returns null when the anchor is not in this track at all.
 */
function resolveAnchor(
  pages: TrackPage[],
  beforePageId: string | null,
  moving: Set<string>,
): string | null {
  if (beforePageId == null) return null;
  const start = pages.findIndex((p) => p.id === beforePageId);
  if (start === -1) return null;
  for (let i = start; i < pages.length; i++) {
    if (!moving.has(pages[i].id)) return pages[i].id;
  }
  return null;
}

function trackSignaturesMatch(a: TrackWorkspace, b: TrackWorkspace): boolean {
  if (a.order.length !== b.order.length) return false;
  return a.order.every((fileId, i) => {
    if (b.order[i] !== fileId) return false;
    const left = a.tracks[fileId]?.pages ?? [];
    const right = b.tracks[fileId]?.pages ?? [];
    return (
      left.length === right.length && left.every((p, j) => p.id === right[j].id)
    );
  });
}

/** File ids whose page list differs from the last saved baseline. */
export function changedTrackIds(state: TrackEditorState): FileId[] {
  return state.present.order.filter((fileId) => {
    const current = state.present.tracks[fileId]?.pages ?? [];
    const original = state.baseline.tracks[fileId]?.pages ?? [];
    return trackSignature(current) !== trackSignature(original);
  });
}
