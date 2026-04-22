/**
 * REST client for the server-side Watch Folder persistence API.
 *
 * These endpoints store folder configs, file metadata, and run history
 * in the server database — the source of truth for proprietary deployments.
 */

import apiClient from '@app/services/apiClient';

// ── Types matching the JPA entities ────────────────────────────────────────

export interface WatchFolderDTO {
  id: string;
  name: string;
  description?: string;
  automationConfig?: string; // JSON-stringified operations array
  icon?: string;
  accentColor?: string;
  scope: 'PERSONAL' | 'ORGANISATION';
  orderIndex?: number;
  isDefault?: boolean;
  isPaused?: boolean;
  inputSource?: string;
  processingMode?: string;
  outputMode?: string;
  outputName?: string;
  outputNamePosition?: string;
  outputTtlHours?: number | null;
  deleteOutputOnDownload?: boolean;
  maxRetries?: number;
  retryDelayMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WatchFolderFileDTO {
  id?: number;
  fileId: string;
  status: string;
  name?: string;
  errorMessage?: string;
  failedAttempts?: number;
  ownedByFolder?: boolean;
  pendingOnServer?: boolean;
  displayFileIds?: string; // JSON array
  serverOutputFilenames?: string; // JSON array
  addedAt?: string;
  processedAt?: string;
}

export interface WatchFolderRunDTO {
  id?: number;
  inputFileId: string;
  displayFileId?: string;
  displayFileIds?: string; // JSON array
  status: string;
  processedAt?: string;
}

// ── API calls ──────────────────────────────────────────────────────────────

const BASE = '/api/v1/watch-folders';

export const watchFolderApi = {
  // Folders
  async list(): Promise<WatchFolderDTO[]> {
    const res = await apiClient.get<WatchFolderDTO[]>(BASE);
    return res.data;
  },

  async get(id: string): Promise<WatchFolderDTO> {
    const res = await apiClient.get<WatchFolderDTO>(`${BASE}/${id}`);
    return res.data;
  },

  async create(folder: WatchFolderDTO): Promise<WatchFolderDTO> {
    const res = await apiClient.post<WatchFolderDTO>(BASE, folder);
    return res.data;
  },

  async update(id: string, folder: Partial<WatchFolderDTO>): Promise<WatchFolderDTO> {
    const res = await apiClient.put<WatchFolderDTO>(`${BASE}/${id}`, folder);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },

  // Files
  async listFiles(folderId: string): Promise<WatchFolderFileDTO[]> {
    const res = await apiClient.get<WatchFolderFileDTO[]>(`${BASE}/${folderId}/files`);
    return res.data;
  },

  async upsertFile(folderId: string, file: WatchFolderFileDTO): Promise<WatchFolderFileDTO> {
    const res = await apiClient.put<WatchFolderFileDTO>(`${BASE}/${folderId}/files`, file);
    return res.data;
  },

  async deleteFiles(folderId: string): Promise<void> {
    await apiClient.delete(`${BASE}/${folderId}/files`);
  },

  // Runs
  async listRuns(folderId: string): Promise<WatchFolderRunDTO[]> {
    const res = await apiClient.get<WatchFolderRunDTO[]>(`${BASE}/${folderId}/runs`);
    return res.data;
  },

  async addRun(folderId: string, run: WatchFolderRunDTO): Promise<WatchFolderRunDTO> {
    const res = await apiClient.post<WatchFolderRunDTO>(`${BASE}/${folderId}/runs`, run);
    return res.data;
  },

  async addRuns(folderId: string, runs: WatchFolderRunDTO[]): Promise<WatchFolderRunDTO[]> {
    const res = await apiClient.post<WatchFolderRunDTO[]>(`${BASE}/${folderId}/runs/batch`, runs);
    return res.data;
  },
};
