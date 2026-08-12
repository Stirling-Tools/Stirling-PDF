/**
 * Thin HTTP client for the Phase A folder endpoints.
 *
 * Returns DTOs that look like the local {@link FolderRecord}; the
 * caller is responsible for merging them into IndexedDB via
 * {@link folderStorage}.
 */

import apiClient from "@app/services/apiClient";
import { FolderId, FolderRecord, parseFolderId } from "@app/types/folder";

interface ServerFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  color: string | null;
  icon: string | null;
  version: number | null;
  // ISO timestamps - older server builds occasionally send `null` when
  // the entity hasn't been flushed; we defend against that in parseTimestamp.
  createdAt: string | null;
  updatedAt: string | null;
}

function parseTimestamp(
  value: string | null | undefined,
  field: string,
): number {
  // Tolerate null/missing - older server builds may serialise pre-flush
  // timestamps as null. Log a warning so a real schema drift still gets
  // attention, but fall back to "now" rather than failing the whole pull.
  if (value == null || value === "") {
    console.warn(
      `[folderSyncService] missing ${field} from server response; defaulting to now`,
    );
    return Date.now();
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ${field} timestamp from server: ${value}`);
  }
  return ms;
}

function toFolderRecord(dto: ServerFolder): FolderRecord {
  // Validate at the trust boundary - server may have a bug or contract drift.
  // parseFolderId throws if `dto.id` isn't a UUID; better a loud failure than
  // a corrupt local cache.
  const id = parseFolderId(dto.id);
  const parentFolderId =
    dto.parentFolderId === null ? null : parseFolderId(dto.parentFolderId);
  return {
    id,
    name: dto.name,
    parentFolderId,
    color: dto.color ?? undefined,
    icon: dto.icon ?? undefined,
    createdAt: parseTimestamp(dto.createdAt, "createdAt"),
    updatedAt: parseTimestamp(dto.updatedAt, "updatedAt"),
  };
}

export const folderSyncService = {
  async list(): Promise<FolderRecord[]> {
    // Auto-fired by FolderProvider on every load; a persistent 401 must fail
    // silently here or the global handler redirects to /login and loops.
    const response = await apiClient.get<ServerFolder[]>(
      "/api/v1/storage/folders",
      {
        suppressErrorToast: true,
        skipAuthRedirect: true,
      },
    );
    return (response.data ?? []).map(toFolderRecord);
  },

  async create(input: {
    id?: FolderId;
    name: string;
    parentFolderId: FolderId | null;
    color?: string;
    icon?: string;
  }): Promise<FolderRecord> {
    const response = await apiClient.post<ServerFolder>(
      "/api/v1/storage/folders",
      {
        id: input.id ?? undefined,
        name: input.name,
        parentFolderId: input.parentFolderId,
        color: input.color,
        icon: input.icon,
      },
    );
    return toFolderRecord(response.data);
  },

  async update(
    id: FolderId,
    patch: {
      name?: string;
      reparent?: boolean;
      parentFolderId?: FolderId | null;
      color?: string | null;
      icon?: string | null;
    },
  ): Promise<FolderRecord> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.reparent) {
      body.reparent = true;
      body.parentFolderId = patch.parentFolderId ?? null;
    }
    if (patch.color !== undefined) body.color = patch.color ?? "";
    if (patch.icon !== undefined) body.icon = patch.icon ?? "";
    const response = await apiClient.patch<ServerFolder>(
      `/api/v1/storage/folders/${id}`,
      body,
    );
    return toFolderRecord(response.data);
  },

  async delete(id: FolderId): Promise<FolderId[]> {
    const response = await apiClient.delete<{ removedFolderIds: string[] }>(
      `/api/v1/storage/folders/${id}`,
    );
    // Validate at the trust boundary - same posture as toFolderRecord.
    return (response.data?.removedFolderIds ?? []).map(parseFolderId);
  },

  async moveFileToFolder(
    fileRemoteId: number,
    folderId: FolderId | null,
  ): Promise<void> {
    await apiClient.patch(`/api/v1/storage/files/${fileRemoteId}/folder`, {
      folderId,
    });
  },

  async bulkMoveFiles(
    fileRemoteIds: number[],
    folderId: FolderId | null,
  ): Promise<{ movedFileIds: number[]; skippedFileIds: number[] }> {
    const response = await apiClient.patch<{
      movedFileIds: number[];
      skippedFileIds: number[];
    }>("/api/v1/storage/files/folder", {
      folderId,
      fileIds: fileRemoteIds,
    });
    return response.data;
  },
};
