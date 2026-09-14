import { FileId } from "@app/types/file";
import { createFileId } from "@app/types/fileContext";
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
  | {
      type: "split";
      /** The track to split. */
      fileId: FileId;
      /** The page that becomes the first page of the new track. */
      startPageId: string;
    }
  | {
      type: "reorderTrack";
      sourceId: FileId;
      /** Move before this track, or to the end when null. */
      beforeId: FileId | null;
    }
  | { type: "dropTracks"; fileIds: FileId[] }
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
  return [
    { fileId: source.fileId, name: source.name, isNew: false, pages },
    next,
  ];
}

/**
 * A unique display name for a split, from the parent's with a `_split` suffix;
 * a counter breaks ties when a document is split more than once.
 */
function splitName(base: string, taken: Set<string>): string {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const primary = `${stem}_split${ext}`;
  if (!taken.has(primary)) return primary;
  let n = 2;
  let candidate = `${stem}_split (${n})${ext}`;
  while (taken.has(candidate)) candidate = `${stem}_split (${++n})${ext}`;
  return candidate;
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

/**
 * Reconciles the open files into the workspace. The workspace order is
 * authoritative (splits and reorders live only here, not in the file list), so
 * this preserves it: file-backed tracks are kept or rebuilt in place, split
 * tracks are kept (their pages pruned if a source file closed), closed files
 * drop out, and newly opened files are appended.
 */
function syncSources(
  state: TrackEditorState,
  sources: TrackSource[],
): TrackEditorState {
  const signatures: Record<FileId, string> = {};
  sources.forEach((source) => {
    signatures[source.fileId] = sourceSignature(source);
  });
  const liveIds = new Set(sources.map((s) => s.fileId));
  const sourceById = new Map(sources.map((s) => [s.fileId, s]));

  // A closed file's bytes are gone, so pages it sourced can't be saved anywhere.
  const pruneDead = (pages: TrackPage[]): TrackPage[] => {
    const kept = pages.filter((p) => liveIds.has(p.sourceFileId));
    return kept.length === pages.length ? pages : kept;
  };

  let seq = state.seq;
  // A file opening/closing, or its bytes changing, can leave undo entries
  // referencing pages that no longer exist — drop history then, but keep it
  // through a pure re-sync that changes nothing.
  let historyValid = true;
  const tracks: Record<FileId, Track> = {};
  const baselineTracks: Record<FileId, Track> = {};
  const order: FileId[] = [];

  for (const id of state.present.order) {
    const track = state.present.tracks[id];
    if (!track) continue;

    if (track.isNew) {
      const pages = pruneDead(track.pages);
      if (pages.length === 0) {
        historyValid = false;
        continue;
      }
      if (pages !== track.pages) historyValid = false;
      tracks[id] = pages === track.pages ? track : { ...track, pages };
      const prevBaseline = state.baseline.tracks[id];
      if (prevBaseline) baselineTracks[id] = prevBaseline;
      order.push(id);
      continue;
    }

    const source = sourceById.get(track.fileId);
    if (!source) {
      // File-backed track whose file has closed.
      historyValid = false;
      continue;
    }
    const changed =
      state.sourceSignatures[track.fileId] !== signatures[track.fileId];
    if (changed) {
      // The bytes changed underneath us, so pending edits to this file are void.
      const [rebuilt, nextSeq] = buildTrack(source, seq);
      seq = nextSeq;
      tracks[id] = rebuilt;
      baselineTracks[id] = rebuilt;
      historyValid = false;
    } else {
      const pages = pruneDead(track.pages);
      if (pages !== track.pages) historyValid = false;
      const next =
        pages === track.pages && track.name === source.name
          ? track
          : { ...track, pages, name: source.name };
      tracks[id] = next;
      baselineTracks[id] = state.baseline.tracks[id] ?? next;
    }
    order.push(id);
  }

  // Newly opened files, not yet represented, join at the end.
  for (const source of sources) {
    if (tracks[source.fileId]) continue;
    const [track, nextSeq] = buildTrack(source, seq);
    seq = nextSeq;
    tracks[source.fileId] = track;
    baselineTracks[source.fileId] = track;
    order.push(source.fileId);
    historyValid = false;
  }

  const orderUnchanged =
    order.length === state.present.order.length &&
    order.every((id, i) => state.present.order[i] === id);
  const tracksUnchanged =
    orderUnchanged &&
    order.every((id) => tracks[id] === state.present.tracks[id]);
  const signaturesUnchanged =
    liveIds.size === Object.keys(state.sourceSignatures).length &&
    sources.every(
      (s) => state.sourceSignatures[s.fileId] === signatures[s.fileId],
    );
  if (tracksUnchanged && signaturesUnchanged) return state;

  return {
    present: { order, tracks },
    baseline: { order, tracks: baselineTracks },
    sourceSignatures: signatures,
    past: historyValid ? state.past : [],
    future: historyValid ? state.future : [],
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

    case "split": {
      const { fileId, startPageId } = action;
      const track = state.present.tracks[fileId];
      if (!track) return state;
      const idx = track.pages.findIndex((p) => p.id === startPageId);
      // A split before the first page (or a missing page) is a no-op.
      if (idx <= 0) return state;

      const newId = createFileId();
      const taken = new Set(
        state.present.order
          .map((id) => state.present.tracks[id]?.name)
          .filter((name): name is string => name != null),
      );
      const newTrack: Track = {
        fileId: newId,
        name: splitName(track.name, taken),
        isNew: true,
        pages: track.pages.slice(idx),
      };

      const orderIdx = state.present.order.indexOf(fileId);
      const nextOrder = [
        ...state.present.order.slice(0, orderIdx + 1),
        newId,
        ...state.present.order.slice(orderIdx + 1),
      ];
      const next: TrackWorkspace = {
        order: nextOrder,
        tracks: {
          ...state.present.tracks,
          [fileId]: { ...track, pages: track.pages.slice(0, idx) },
          [newId]: newTrack,
        },
      };
      return withEdit(state, next);
    }

    case "reorderTrack": {
      const { sourceId, beforeId } = action;
      const current = state.present.order;
      if (!current.includes(sourceId)) return state;
      const without = current.filter((id) => id !== sourceId);
      const at = beforeId == null ? without.length : without.indexOf(beforeId);
      const insertAt = at === -1 ? without.length : at;
      const nextOrder = [
        ...without.slice(0, insertAt),
        sourceId,
        ...without.slice(insertAt),
      ];
      if (nextOrder.every((id, i) => current[i] === id)) return state;
      // Reorder is not a page edit, so it stays out of the undo history and
      // does not touch the baseline (pending edits remain pending).
      return {
        ...state,
        present: { order: nextOrder, tracks: state.present.tracks },
        baseline: { order: nextOrder, tracks: state.baseline.tracks },
      };
    }

    case "dropTracks": {
      const drop = new Set(action.fileIds);
      if (!state.present.order.some((id) => drop.has(id))) return state;
      const order = state.present.order.filter((id) => !drop.has(id));
      const tracks: Record<FileId, Track> = {};
      const baselineTracks: Record<FileId, Track> = {};
      for (const id of order) {
        const track = state.present.tracks[id];
        if (track) tracks[id] = track;
        const baseline = state.baseline.tracks[id];
        if (baseline) baselineTracks[id] = baseline;
      }
      // Removing a track is structural, like a sync: its pages must not linger
      // in the undo history.
      return {
        ...state,
        present: { order, tracks },
        baseline: { order, tracks: baselineTracks },
        past: [],
        future: [],
      };
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
