/**
 * Client for processing folders (`/api/v1/processing-folders`) — a storage
 * folder with a pipeline attached, so any file added to it is processed. The
 * backend composes the source + policy pair behind this route; nothing here
 * deals in policies or sources directly.
 */

import apiClient from "@app/services/apiClient";

/** The classify step: identifies the document's type and tags it. No parameters. */
export const CLASSIFY_OPERATION = "/api/v1/ai/tools/classify-and-label";

export interface ProcessingFolderStep {
  operation: string;
  parameters: Record<string, unknown>;
  assets?: Record<string, unknown>;
}

export interface ProcessingFolder {
  id: string;
  /** Set for a storage-backed folder; null when the folder is mounted from disk. */
  folderId: string | null;
  /** Set for a disk-backed (mounted) folder; null when it is storage-backed. */
  directory: string | null;
  name: string;
  enabled: boolean;
  steps: ProcessingFolderStep[];
  output: Record<string, unknown>;
  /** Runs the creating sweep started; 0 means there was nothing new to process. */
  startedRuns: number;
  /** Files the creating sweep skipped because this folder had already processed them. */
  alreadyProcessed: number;
}

/**
 * Exactly one of `folderId` (a folder in app storage) or `directory` (a directory on the server's
 * disk — on a desktop or self-hosted install, the user's own machine) says where a folder watches.
 */
export interface SaveProcessingFolderRequest {
  id?: string | null;
  folderId?: string;
  directory?: string;
  enabled?: boolean;
  steps: ProcessingFolderStep[];
  output?: Record<string, unknown>;
}

/** Every processing folder the current user owns. */
export async function fetchProcessingFolders(): Promise<ProcessingFolder[]> {
  const res = await apiClient.get<ProcessingFolder[]>(
    "/api/v1/processing-folders",
  );
  return res.data ?? [];
}

/**
 * Create or update one. Creating immediately processes what is already in the
 * folder; the backend's ledger keeps already-processed files from re-running.
 */
export async function saveProcessingFolder(
  request: SaveProcessingFolderRequest,
): Promise<ProcessingFolder> {
  const res = await apiClient.post<ProcessingFolder>(
    "/api/v1/processing-folders",
    request,
  );
  return res.data;
}

/** Run the pipeline over the folder's current contents now. */
export async function sweepProcessingFolder(id: string): Promise<void> {
  await apiClient.post(`/api/v1/processing-folders/${id}/sweep`);
}

/** Remove the processing behaviour. The folder and its files are untouched. */
export async function deleteProcessingFolder(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/processing-folders/${id}`);
}

/**
 * The default pipeline a folder gets when it is turned into a processing
 * folder: classification, matching the Classification policy. Outputs replace
 * the file in place as a new version so the folder does not fill with copies.
 */
export function classificationDefaults(
  folderId: string,
): SaveProcessingFolderRequest {
  return {
    folderId,
    enabled: true,
    steps: [{ operation: CLASSIFY_OPERATION, parameters: {}, assets: {} }],
    output: { mode: "new_version" },
  };
}

/** The server's Downloads directory and what is waiting in it. */
export interface DownloadsSuggestion {
  directory: string;
  available: boolean;
  pdfCount: number;
  limit: number;
}

/**
 * Where the server's own Downloads directory is and how many PDFs sit in it.
 * The browser cannot see the machine's paths, so the offer is built from this.
 */
export async function fetchDownloadsSuggestion(): Promise<DownloadsSuggestion> {
  const res = await apiClient.get<DownloadsSuggestion>(
    "/api/v1/processing-folders/downloads-suggestion",
  );
  return res.data;
}

/** Runs belonging to a processing folder, newest first — drives the progress display. */
export async function fetchProcessingFolderRuns(
  policyId: string,
): Promise<{ status: string; error?: string | null }[]> {
  const res = await apiClient.get<
    { policyId?: string; status: string; error?: string | null }[]
  >("/api/v1/policies/runs");
  return (res.data ?? []).filter((run) => run.policyId === policyId);
}

/** One file in a mounted (disk-backed) processing folder. */
export interface MountedFile {
  name: string;
  sizeBytes: number;
  lastModified: number;
}

/**
 * The contents of a disk-backed processing folder, read from the directory itself — the folder is
 * mounted, not mirrored, so the filesystem stays the single source of truth.
 */
export async function fetchMountedFiles(id: string): Promise<MountedFile[]> {
  const res = await apiClient.get<MountedFile[]>(
    `/api/v1/processing-folders/${id}/files`,
  );
  return res.data ?? [];
}
