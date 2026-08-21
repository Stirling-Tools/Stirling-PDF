import { FolderRecord } from "@app/types/folder";

const STORAGE_KEY = "stirling-folder-tree-width";
export const MIN_WIDTH = 210;
export const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 272;

const ROW_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const COUNT_FONT =
  '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
/** Per-row chrome: left padding + toggle + icon + name margin + count margin + right padding. */
const ROW_CHROME = 14 + 16 + 18 + 8 + 12 + 8 + 14;
const INDENT_PER_LEVEL = 16;

function loadCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

function depthOf(
  folder: FolderRecord,
  byId: Map<string, FolderRecord>,
): number {
  let depth = 0;
  let cursor: FolderRecord | undefined = folder;
  while (cursor && cursor.parentFolderId) {
    depth += 1;
    cursor = byId.get(cursor.parentFolderId as string);
    if (depth > 50) break;
  }
  return depth;
}

/** Width needed to fit the longest folder row, clamped to [MIN, MAX]. */
export function computeAutoFitWidth(
  folders: FolderRecord[],
  rootLabel: string,
): number {
  const ctx = loadCanvas();
  if (!ctx) return DEFAULT_WIDTH;
  const byId = new Map(folders.map((f) => [f.id as string, f]));
  let maxName = 0;
  let maxDepth = 0;
  ctx.font = ROW_FONT;
  const measure = (name: string) => Math.ceil(ctx.measureText(name).width);
  maxName = Math.max(maxName, measure(rootLabel));
  for (const f of folders) {
    const w = measure(f.name);
    const d = depthOf(f, byId);
    if (w > maxName) maxName = w;
    if (d > maxDepth) maxDepth = d;
  }
  ctx.font = COUNT_FONT;
  // 4 digits covers typical counts (9999).
  const countWidth = Math.ceil(ctx.measureText("9999").width);
  const width = ROW_CHROME + maxDepth * INDENT_PER_LEVEL + maxName + countWidth;
  return clamp(width);
}

export function clamp(width: number): number {
  if (Number.isNaN(width)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)));
}

export function loadPersistedWidth(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage?.getItem(STORAGE_KEY);
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed);
}

export function savePersistedWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, String(clamp(width)));
  } catch {
    // localStorage can throw in private mode or when over quota; ignore.
  }
}
