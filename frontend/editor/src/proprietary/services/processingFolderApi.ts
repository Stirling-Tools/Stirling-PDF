/**
 * Client for `/api/v1/processing-folders`: a folder with a pipeline attached.
 * The backend composes the source + policy pair behind the route.
 */

import apiClient from "@app/services/apiClient";
import { readDiskFile } from "@app/services/localFolderContents";

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
}

/** Exactly one of `folderId` (app storage) or `directory` (server-disk path) says where a
 *  folder watches. */
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

/** Create or update one; creating sweeps the existing backlog behind the response. */
export async function saveProcessingFolder(
  request: SaveProcessingFolderRequest,
): Promise<ProcessingFolder> {
  const res = await apiClient.post<ProcessingFolder>(
    "/api/v1/processing-folders",
    request,
  );
  return res.data;
}

export interface SweepOutcome {
  runIds: string[];
  filesListed: number;
  alreadyProcessed: number;
  /** Files skipped because an earlier run failed on them and they stayed parked. */
  parked: number;
  /** Files the sweep took on again after an earlier failure. */
  retried: number;
}

export async function sweepProcessingFolder(id: string): Promise<SweepOutcome> {
  const res = await apiClient.post<SweepOutcome>(
    `/api/v1/processing-folders/${id}/sweep`,
  );
  return res.data;
}

/** Cancel the folder's in-flight runs; cancelled files return to queued. */
export async function cancelProcessingRuns(id: string): Promise<void> {
  await apiClient.post(`/api/v1/processing-folders/${id}/runs/cancel`);
}

/** Remove the processing behaviour. The folder and its files are untouched. */
export async function deleteProcessingFolder(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/processing-folders/${id}`);
}

/** The default pipeline: classification. Outputs replace the file in place. */
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

export interface DownloadsSuggestion {
  directory: string;
  available: boolean;
  pdfCount: number;
  limit: number;
}

/** The server's Downloads path and PDF count — the browser cannot see machine paths. */
export async function fetchDownloadsSuggestion(): Promise<DownloadsSuggestion> {
  const res = await apiClient.get<DownloadsSuggestion>(
    "/api/v1/processing-folders/downloads-suggestion",
  );
  return res.data;
}

/** One file a run produced. Downloadable by id from the general files endpoint. */
export interface ProcessingRunOutput {
  fileId: string;
  fileName?: string | null;
}

export interface ProcessingFolderRun {
  runId?: string;
  status: string;
  error?: string | null;
  outputs?: ProcessingRunOutput[] | null;
  /** The input document's display name, for runs whose source recorded one. */
  fileName?: string | null;
  currentStep?: number;
  stepCount?: number;
}

/** Runs belonging to a processing folder, newest first — drives the progress display. */
export async function fetchProcessingFolderRuns(
  policyId: string,
): Promise<ProcessingFolderRun[]> {
  // Filtered server-side (this polls every second); the client-side filter guards
  // against a backend that ignores the parameter.
  const res = await apiClient.get<
    (ProcessingFolderRun & { policyId?: string })[]
  >("/api/v1/policies/runs", { params: { policyId } });
  return (res.data ?? []).filter((run) => run.policyId === policyId);
}

/** An absolute filesystem path (Windows drive-letter or POSIX rooted). */
function isAbsolutePath(value: string): boolean {
  return /^([A-Za-z]:[\\/]|\/)/.test(value);
}

/**
 * Fetch a run output's bytes as a File. A storage-backed run's `fileId` is a stored-file id
 * (the job-files endpoint rejects it — same field name, different id space). A disk-backed
 * run's `fileId` is synthetic and `fileName` is an absolute output path, readable only where
 * the build can see the filesystem (desktop).
 */
export async function fetchRunOutputFile(
  output: ProcessingRunOutput,
): Promise<File> {
  const name = output.fileName?.trim() || `${output.fileId}.pdf`;
  if (isAbsolutePath(name)) {
    const baseName = name.split(/[\\/]/).pop() || name;
    const file = await readDiskFile({
      path: name,
      name: baseName,
      sizeBytes: 0,
      lastModified: 0,
    });
    if (!file) {
      throw new Error(`This build cannot read the run output at ${name}`);
    }
    return file;
  }
  const res = await apiClient.get(
    `/api/v1/storage/files/${output.fileId}/download`,
    { responseType: "blob" },
  );
  return new File([res.data as Blob], name, {
    type: (res.data as Blob).type || "application/pdf",
  });
}

export interface MountedFile {
  name: string;
  sizeBytes: number;
  lastModified: number;
  /** Its place in the folder's pipeline: done, processing, failed, or waiting. */
  state: "done" | "processing" | "failed" | "waiting";
  hasOriginal?: boolean;
}

export async function fetchMountedFiles(id: string): Promise<MountedFile[]> {
  const res = await apiClient.get<MountedFile[]>(
    `/api/v1/processing-folders/${id}/files`,
  );
  return res.data ?? [];
}

/** Retry one failed file now; every other parked failure stays parked. */
export async function retryMountedFile(
  id: string,
  name: string,
): Promise<void> {
  await apiClient.post(`/api/v1/processing-folders/${id}/files/retry`, {
    name,
  });
}

/** Restore a file's archived original, discarding its processed version. */
export async function revertMountedFile(
  id: string,
  name: string,
): Promise<void> {
  await apiClient.post(`/api/v1/processing-folders/${id}/files/revert`, {
    name,
  });
}

/** Outcome of a folder-wide restore: originals brought back, files left as-is. */
export interface RevertAllOutcome {
  restored: number;
  skipped: number;
}

/** Restore every archived original at once; files mid-run are skipped, not raced. */
export async function revertAllMountedFiles(
  id: string,
): Promise<RevertAllOutcome> {
  const res = await apiClient.post<RevertAllOutcome>(
    `/api/v1/processing-folders/${id}/files/revert-all`,
  );
  return res.data;
}
