/**
 * Client for the server-side Watch Folder API.
 *
 * These endpoints manage subdirectories under the server's watchedFolders root.
 * PipelineDirectoryProcessor scans them every 60 seconds and processes any files found.
 */

import apiClient from '@app/services/apiClient';
import { getSessionId } from '@app/hooks/useSSEConnection';

export interface ServerFolderOutputFile {
  filename: string;
  size: number;
  lastModified: number;
}

/** Create the server-side watch subdirectory and write pipeline.json + session.json. */
export async function createServerFolder(
  folderId: string,
  name: string,
  configJson: string,
  outputTtlHours?: number | null,
  deleteOutputOnDownload?: boolean
): Promise<void> {
  const formData = new FormData();
  formData.append('folderId', folderId);
  formData.append('name', name);
  formData.append('sessionId', getSessionId());
  formData.append('json', configJson);
  if (outputTtlHours != null) formData.append('outputTtlHours', String(outputTtlHours));
  if (deleteOutputOnDownload) formData.append('deleteOutputOnDownload', 'true');
  await apiClient.post('/api/v1/pipeline/server-folder', formData);
}

/** Update pipeline.json for an existing server watch folder. */
export async function updateServerFolder(
  folderId: string,
  name: string,
  configJson: string,
  outputTtlHours?: number | null,
  deleteOutputOnDownload?: boolean
): Promise<void> {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('json', configJson);
  if (outputTtlHours != null) formData.append('outputTtlHours', String(outputTtlHours));
  if (deleteOutputOnDownload) formData.append('deleteOutputOnDownload', 'true');
  await apiClient.put(`/api/v1/pipeline/server-folder/${folderId}`, formData);
}

/**
 * Update session.json with the current sessionId.
 * Called on mount so SSE notifications reach the current browser session
 * even if localStorage was cleared since the folder was created.
 */
export async function updateServerFolderSession(folderId: string): Promise<void> {
  await apiClient.put(`/api/v1/pipeline/server-folder/${folderId}/session`, {
    sessionId: getSessionId(),
  });
}

/** Delete the watch subdirectory and its output folder from the server. */
export async function deleteServerFolder(folderId: string): Promise<void> {
  await apiClient.delete(`/api/v1/pipeline/server-folder/${folderId}`);
}

/**
 * Upload a file into the server watch folder for PipelineDirectoryProcessor to pick up.
 * The file is stored as {@code {fileId}.{ext}} so the backend can include the fileId in the
 * SSE completion event — no filename-based matching needed on the frontend.
 */
export async function uploadFileToServerFolder(folderId: string, fileId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('fileId', fileId);
  await apiClient.post(`/api/v1/pipeline/server-folder/${folderId}/files`, formData);
}

/** List output files that PipelineDirectoryProcessor has written to the finished folder. */
export async function listServerFolderOutput(
  folderId: string
): Promise<ServerFolderOutputFile[]> {
  const response = await apiClient.get<ServerFolderOutputFile[]>(
    `/api/v1/pipeline/server-folder/${folderId}/output`
  );
  return response.data;
}

/**
 * Trigger immediate async processing for a server watch folder.
 * Called after uploading a file so it doesn't wait for the 60-second scheduled scan.
 */
export async function triggerServerFolderProcessing(folderId: string): Promise<void> {
  await apiClient.post(`/api/v1/pipeline/server-folder/${folderId}/process`);
}

/** Delete a specific output file from the server's processed/ dir (used with deleteOutputOnDownload). */
export async function deleteServerFolderOutput(folderId: string, filename: string): Promise<void> {
  await apiClient.delete(`/api/v1/pipeline/server-folder/${folderId}/output/${encodeURIComponent(filename)}`);
}

/** Download a specific output file from the finished folder. */
export async function downloadServerFolderOutput(
  folderId: string,
  filename: string
): Promise<File> {
  const response = await apiClient.get<Blob>(
    `/api/v1/pipeline/server-folder/${folderId}/output/${encodeURIComponent(filename)}`,
    { responseType: 'blob' }
  );
  // Prefer the server's Content-Type; fall back to extension-based detection since
  // some environments serve blobs as application/octet-stream regardless of the file type.
  const mimeType = (response.data.type && response.data.type !== 'application/octet-stream')
    ? response.data.type
    : filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : response.data.type;
  return new File([response.data], filename, {
    type: mimeType,
    lastModified: Date.now(),
  });
}
