import * as server from "@proprietary/services/processingFolderApi";
export type {
  ProcessingFolderStep,
  ProcessingFolder,
  SaveProcessingFolderRequest,
  SweepOutcome,
  ProcessingRunOutput,
  ProcessingFolderRun,
  MountedFile,
  RevertAllOutcome,
} from "@proprietary/services/processingFolderApi";
export {
  CLASSIFY_OPERATION,
  classificationDefaults,
  fetchRunOutputFile,
} from "@proprietary/services/processingFolderApi";
import { localProcessingFolderStorage as storage } from "@app/services/localProcessingFolderStorage";
import {
  cancelLocalProcessingRuns,
  isLocalProcessingFolder,
  localProcessingFolders,
  requireLocalProcessingFolder,
  revertLocalProcessingFile,
  saveLocalProcessingFolder,
  sweepLocalProcessingFolder,
} from "@app/services/localProcessingFolders";
import { listDirectory } from "@app/services/localFolderContents";

/** Combines connected-server folders with this account's desktop watches. */
export async function fetchProcessingFolders(): Promise<
  server.ProcessingFolder[]
> {
  const local = await localProcessingFolders();
  const remote = await server.fetchProcessingFolders();
  return [...remote.filter((folder) => folder.folderId !== null), ...local];
}

/** A desktop path is a client-side watch; only server-storage ids go to the server folder API. */
export async function saveProcessingFolder(
  request: server.SaveProcessingFolderRequest,
): Promise<server.ProcessingFolder> {
  return request.directory ||
    (request.id && isLocalProcessingFolder(request.id))
    ? saveLocalProcessingFolder(request)
    : server.saveProcessingFolder(request);
}

export async function sweepProcessingFolder(
  id: string,
): Promise<server.SweepOutcome> {
  return isLocalProcessingFolder(id)
    ? sweepLocalProcessingFolder(id)
    : server.sweepProcessingFolder(id);
}

export async function cancelProcessingRuns(id: string): Promise<void> {
  return isLocalProcessingFolder(id)
    ? cancelLocalProcessingRuns(id)
    : server.cancelProcessingRuns(id);
}

/** Removes desktop watch settings and history; on-disk inputs and archived originals remain. */
export async function deleteProcessingFolder(id: string): Promise<void> {
  if (!isLocalProcessingFolder(id)) return server.deleteProcessingFolder(id);
  await cancelLocalProcessingRuns(id);
  await storage.deleteFolder(id);
  for (const entry of await storage.files(id))
    await storage.deleteFile(entry.id);
}

export async function fetchProcessingFolderRuns(
  id: string,
): Promise<server.ProcessingFolderRun[]> {
  if (!isLocalProcessingFolder(id)) return server.fetchProcessingFolderRuns(id);
  await requireLocalProcessingFolder(id);
  return (await storage.files(id)).map((entry) => entry.run);
}

export async function fetchMountedFiles(
  id: string,
): Promise<server.MountedFile[]> {
  if (!isLocalProcessingFolder(id)) return server.fetchMountedFiles(id);
  const folder = await requireLocalProcessingFolder(id);
  const history = await storage.files(id);
  const listing = await listDirectory(folder.directory);
  return (listing?.files ?? []).map((file) => {
    const entry = history.find(
      (record) =>
        record.input.name === file.name ||
        record.outputs.some((output) => output.name === file.name),
    );
    const status = entry?.run.status;
    return {
      name: file.name,
      sizeBytes: file.sizeBytes,
      lastModified: file.lastModified,
      state:
        status === "COMPLETED"
          ? "done"
          : status === "FAILED"
            ? "failed"
            : status && status !== "CANCELLED"
              ? "processing"
              : "waiting",
      hasOriginal: Boolean(entry?.originalPath),
    };
  });
}

/** An explicit retry releases only the named failed document. */
export async function retryMountedFile(
  id: string,
  name: string,
): Promise<void> {
  if (!isLocalProcessingFolder(id)) return server.retryMountedFile(id, name);
  await requireLocalProcessingFolder(id);
  const entry = (await storage.files(id)).find(
    (record) => record.input.name === name,
  );
  if (!entry || entry.run.status !== "FAILED") return;
  await sweepLocalProcessingFolder(id, true, name);
}

export async function revertMountedFile(
  id: string,
  name: string,
): Promise<void> {
  return isLocalProcessingFolder(id)
    ? revertLocalProcessingFile(id, name)
    : server.revertMountedFile(id, name);
}

export async function revertAllMountedFiles(
  id: string,
): Promise<server.RevertAllOutcome> {
  if (!isLocalProcessingFolder(id)) return server.revertAllMountedFiles(id);
  await requireLocalProcessingFolder(id);
  const result = { restored: 0, skipped: 0 };
  for (const entry of await storage.files(id)) {
    try {
      await revertLocalProcessingFile(id, entry.input.name);
      result.restored++;
    } catch {
      result.skipped++;
    }
  }
  return result;
}
