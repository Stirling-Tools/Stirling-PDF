/**
 * Folder types for the advanced file manager.
 * Folders provide a hierarchical organization layer on top of the flat
 * file storage in IndexedDB. A folder is identified by a branded UUID
 * and may reference a parent folder; a `null` parent means the root.
 */

import { generateId } from "@app/utils/generateId";

declare const folderTag: unique symbol;
export type FolderId = string & { readonly [folderTag]: "FolderId" };

/** The root folder is represented in UI/state by `null`. */
export const ROOT_FOLDER_ID: null = null;

/**
 * UI sentinel for the pinned "Local" pseudo-folder. Never sent to the server,
 * never persisted to IndexedDB - only used as a `currentFolderId` value
 * to scope the file grid to local-only files. The underlying data predicate
 * is `remoteStorageId == null`.
 */
export const LOCAL_PSEUDO_FOLDER_ID = "__local__" as const;
export type LocalPseudoFolderId = typeof LOCAL_PSEUDO_FOLDER_ID;

/** Default colour palette used when no explicit colour is provided. */
export const FOLDER_COLOR_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
] as const;

/** Members of {@link FOLDER_COLOR_PALETTE}. Use this rather than `string` to keep callers honest. */
export type FolderPaletteColor = (typeof FOLDER_COLOR_PALETTE)[number];

/** Persisted folder shape stored in IndexedDB. */
export interface FolderRecord {
  id: FolderId;
  name: string;
  parentFolderId: FolderId | null;
  /** Hex colour - either a palette member or any custom hex from a future picker. */
  color?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Folder tree node - derived from FolderRecord[] for rendering the tree
 * navigator. Children are ordered by name (case-insensitive).
 */
export interface FolderTreeNode {
  folder: FolderRecord;
  children: FolderTreeNode[];
  depth: number;
}

/** A path entry shown in the breadcrumb bar. `null` represents the root. */
export interface FolderBreadcrumbEntry {
  id: FolderId | null;
  name: string;
}

/**
 * Generic RFC-4122 UUID regex (case-insensitive). Accepts any valid UUID variant - server-side
 * {@code UUID.randomUUID()} is v4 in practice, but other tools and tests may produce v1/v3/v5.
 * Being strict-v4-only here turned the {@code pullFromServer} merge into a silent skip whenever
 * a non-v4 id arrived.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runtime check that a value is a UUID. Throws on garbage from the wire. */
export function parseFolderId(value: unknown): FolderId {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new Error(`Invalid FolderId: ${String(value)}`);
  }
  return value as FolderId;
}

export function createFolderId(): FolderId {
  return generateId() as FolderId;
}

export function pickFolderColor(seed: string): FolderPaletteColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % FOLDER_COLOR_PALETTE.length;
  return FOLDER_COLOR_PALETTE[idx]!;
}
