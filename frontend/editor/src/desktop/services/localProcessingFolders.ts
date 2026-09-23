import { remove } from "@tauri-apps/plugin-fs";
import {
  localFolderStorage,
  directoryKey,
} from "@app/services/localFolderStorage";
import {
  listDirectory,
  readDiskFile,
  writeDiskFile,
} from "@app/services/localFolderContents";
import {
  localProcessingFolderStorage as storage,
  type LocalProcessingFolder,
  type LocalProcessingFile,
} from "@app/services/localProcessingFolderStorage";
import {
  getServerAutomationSession,
  requireAutomationSession,
  type ServerAutomationSession,
} from "@app/services/serverAutomationSession";
import {
  submitServerPipeline,
  waitForServerPipeline,
  downloadServerPipelineOutput,
} from "@app/services/serverPipeline";
import {
  archiveProcessingInput,
  processingFileState,
  processingPath,
  readProcessingOriginal,
  replaceProcessingFile,
  requireUnchangedProcessingFile,
  sameProcessingFile,
} from "@app/services/localProcessingDelivery";
import type {
  ProcessingFolderStep,
  SaveProcessingFolderRequest,
  SweepOutcome,
} from "@app/services/processingFolderApi";
import type { BackendPipelineStep } from "@app/services/policyPipeline";
import { generateId } from "@app/utils/generateId";

const running = new Map<string, Promise<void>>();
const cancelled = new Set<string>();
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/** Recognises only this desktop's processing-record namespace. */
export function isLocalProcessingFolder(id: string): boolean {
  return id.startsWith("desktop:");
}

/** Folder configuration is scoped to its server and account, including when both use this disk path. */
export async function localProcessingFolders(): Promise<
  LocalProcessingFolder[]
> {
  const session = await getServerAutomationSession();
  return (await storage.folders()).filter(
    (folder) => folder.sessionKey === session.key,
  );
}

/** Rejects stale UI actions after sign-out, server changes, or unmounting the source directory. */
export async function requireLocalProcessingFolder(
  id: string,
): Promise<LocalProcessingFolder> {
  const folder = await storage.folder(id);
  if (!folder) throw new Error("Processing folder not found");
  await requireAutomationSession(folder.sessionKey);
  const mounted = (await localFolderStorage.getAllFolders()).some(
    (mount) =>
      directoryKey(mount.directory ?? "") === directoryKey(folder.directory),
  );
  if (!mounted) throw new Error("The processing folder is no longer mounted");
  return folder;
}

/** Saves desktop watch settings; a directory path is never submitted as a server-disk source. */
export async function saveLocalProcessingFolder(
  request: SaveProcessingFolderRequest,
): Promise<LocalProcessingFolder> {
  const session = await getServerAutomationSession();
  const existing = request.id
    ? await requireLocalProcessingFolder(request.id)
    : (await localProcessingFolders()).find(
        (folder) =>
          directoryKey(folder.directory) ===
          directoryKey(request.directory ?? ""),
      );
  const directory = existing?.directory ?? request.directory?.trim();
  if (!directory || request.folderId)
    throw new Error("A desktop folder needs a local directory");
  const mounted = (await localFolderStorage.getAllFolders()).some(
    (folder) =>
      directoryKey(folder.directory ?? "") === directoryKey(directory),
  );
  if (!mounted)
    throw new Error("Mount the directory before enabling processing");
  const folder: LocalProcessingFolder = {
    id: existing?.id ?? `desktop:${generateId()}`,
    sessionKey: session.key,
    directory,
    folderId: null,
    name: directory.split(/[/\\]/).filter(Boolean).pop() ?? directory,
    // Editing a paused folder must not silently resume it: keep the existing state unless
    // the request explicitly sets one; a fresh folder defaults to enabled.
    enabled: request.enabled ?? existing?.enabled ?? true,
    steps: request.steps,
    output: { ...request.output, directory, replace: true },
  };
  await storage.saveFolder(folder);
  if (!existing || folder.enabled) {
    await sweepLocalProcessingFolder(folder.id);
  }
  return folder;
}

/** Maps supporting files to multipart assets while preserving server operation paths. */
function pipelineSteps(steps: ProcessingFolderStep[]): {
  steps: BackendPipelineStep[];
  assets: { key: string; file: Blob }[];
} {
  const assets: { key: string; file: Blob }[] = [];
  return {
    steps: steps.map((step, index) => {
      const fileParameters: Record<string, string> = { ...step.fileParameters };
      for (const [name, value] of Object.entries(step.assets ?? {})) {
        if (!(value instanceof Blob))
          throw new Error(`Unsupported pipeline asset: ${name}`);
        const key = `step-${index}-${name}`;
        assets.push({ key, file: value });
        fileParameters[name] = key;
      }
      return {
        operation: step.operation,
        parameters: step.parameters,
        fileParameters,
      };
    }),
    assets,
  };
}

async function processFile(
  session: ServerAutomationSession,
  folder: LocalProcessingFolder,
  entry: LocalProcessingFile,
): Promise<void> {
  try {
    let runId = entry.serverRunId;
    if (!runId) {
      if (entry.run.status === "SUBMITTING") {
        throw new Error(
          "The previous submission could not be confirmed. Check the server's run history before retrying.",
        );
      }
      await requireUnchangedProcessingFile(entry.input);
      const file = await readDiskFile(entry.input);
      if (!file) throw new Error(`Cannot read ${entry.input.name}`);
      await requireUnchangedProcessingFile(entry.input);
      entry.originalPath ??= await archiveProcessingInput(
        folder.directory,
        file,
      );
      await storage.saveFile(entry);
      const pipeline = pipelineSteps(folder.steps);
      entry.run = { ...entry.run, status: "SUBMITTING" };
      await storage.saveFile(entry);
      runId = await submitServerPipeline(
        session,
        folder.name,
        pipeline.steps,
        [file],
        pipeline.assets,
      );
      entry.serverRunId = runId;
      entry.run = { ...entry.run, status: "RUNNING" };
      await storage.saveFile(entry);
    }
    const completed = await waitForServerPipeline(session, runId);
    await requireAutomationSession(session.key);
    await requireLocalProcessingFolder(folder.id);
    if (cancelled.has(folder.id)) throw new Error("Processing cancelled");
    await requireUnchangedProcessingFile(entry.input);
    const outputFiles = [];
    for (const output of completed.outputs) {
      outputFiles.push(await downloadServerPipelineOutput(session, output));
    }
    await requireLocalProcessingFolder(folder.id);
    if (cancelled.has(folder.id)) throw new Error("Processing cancelled");
    const sameFormat =
      outputFiles.length === 1 &&
      outputFiles[0].name.split(".").pop()?.toLowerCase() ===
        entry.input.name.split(".").pop()?.toLowerCase();
    if (sameFormat) {
      entry.outputs = [
        await replaceProcessingFile(entry.input, outputFiles[0]),
        ...entry.outputs.filter((output) => output.path !== entry.input.path),
      ];
    } else {
      for (const file of outputFiles) {
        await requireAutomationSession(session.key);
        const name = await writeDiskFile(folder.directory, file.name, file);
        if (!name)
          throw new Error("The processing folder is no longer mounted");
        entry.outputs.push(
          await processingFileState(processingPath(folder.directory, name)),
        );
        await storage.saveFile(entry);
      }
    }
    entry.run = {
      ...entry.run,
      status: "COMPLETED",
      currentStep: completed.stepCount,
      stepCount: completed.stepCount,
      outputs: entry.outputs.map((output) => ({
        fileId: entry.id,
        fileName: output.path,
      })),
    };
  } catch (error) {
    // A disconnected run keeps its server id for reconciliation, avoiding a second charge on reconnect.
    try {
      await requireAutomationSession(session.key);
    } catch {
      return;
    }
    entry.run = {
      ...entry.run,
      status: cancelled.has(folder.id) ? "CANCELLED" : "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  await storage.saveFile(entry);
}

async function drain(folderId: string, allowQueued: boolean): Promise<void> {
  const session = await getServerAutomationSession();
  const folder = await requireLocalProcessingFolder(folderId);
  const pending = (await storage.files(folderId)).filter(
    (entry) => !TERMINAL.has(entry.run.status),
  );
  for (const entry of pending) {
    if (cancelled.has(folderId)) return;
    await requireAutomationSession(session.key);
    const current = await storage.folder(folderId);
    if (!current) return;
    if (
      !entry.serverRunId &&
      (!allowQueued || (folder.enabled && !current.enabled))
    )
      continue;
    await processFile(session, folder, entry);
  }
}

function startDrain(folderId: string, allowQueued = true): void {
  if (running.has(folderId)) return;
  const work = navigator.locks
    .request(`processing:${folderId}`, async () => {
      await drain(folderId, allowQueued);
    })
    .catch(() => {
      // A disconnected or unmounted folder resumes from its saved run ids when available again.
    })
    .finally(() => {
      running.delete(folderId);
    });
  running.set(folderId, work);
}

/** Queues changed PDFs once; explicit retries include parked failures, background scans do not. */
export async function sweepLocalProcessingFolder(
  id: string,
  retryFailed = true,
  fileName?: string,
): Promise<SweepOutcome> {
  return navigator.locks.request(
    `processing:${id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        return {
          runIds: [],
          filesListed: 0,
          alreadyProcessed: 0,
          parked: 0,
          retried: 0,
        };
      return queueLocalProcessingFiles(id, retryFailed, fileName);
    },
  );
}

async function queueLocalProcessingFiles(
  id: string,
  retryFailed: boolean,
  fileName?: string,
): Promise<SweepOutcome> {
  const folder = await requireLocalProcessingFolder(id);
  const listing = await listDirectory(folder.directory);
  const history = await storage.files(id);
  const outputs = history.flatMap((entry) => entry.outputs);
  const result: SweepOutcome = {
    runIds: [],
    filesListed: 0,
    alreadyProcessed: 0,
    parked: 0,
    retried: 0,
  };
  for (const input of listing?.files ?? []) {
    if (fileName && input.name !== fileName) continue;
    if (!input.name.toLowerCase().endsWith(".pdf")) continue;
    result.filesListed++;
    const previous = history.find((entry) => entry.input.path === input.path);
    const output = outputs.some((file) => sameProcessingFile(file, input));
    if (previous && !TERMINAL.has(previous.run.status)) {
      result.runIds.push(previous.run.runId!);
      continue;
    }
    if (previous?.run.status === "CANCELLED" && !retryFailed) continue;
    if (
      output ||
      (previous?.run.status === "COMPLETED" &&
        sameProcessingFile(previous.input, input))
    ) {
      result.alreadyProcessed++;
      continue;
    }
    if (
      previous?.run.status === "FAILED" &&
      !retryFailed &&
      sameProcessingFile(previous.input, input)
    ) {
      result.parked++;
      continue;
    }
    if (previous?.run.status === "FAILED") result.retried++;
    const entry: LocalProcessingFile = {
      id: previous?.id ?? generateId(),
      folderId: id,
      input,
      outputs: previous?.outputs ?? [],
      originalPath: previous?.originalPath,
      run: {
        runId: `queued:${generateId()}`,
        status: "PENDING",
        fileName: input.name,
        stepCount: folder.steps.length,
      },
    };
    await storage.saveFile(entry);
    result.runIds.push(entry.run.runId!);
  }
  cancelled.delete(id);
  startDrain(id);
  return result;
}

/** Pauses new submissions and discards queued work. Already-submitted server work remains server-owned. */
export async function cancelLocalProcessingRuns(id: string): Promise<void> {
  const folder = await requireLocalProcessingFolder(id);
  cancelled.add(id);
  await storage.saveFolder({ ...folder, enabled: false });
  for (const entry of await storage.files(id)) {
    if (!TERMINAL.has(entry.run.status)) {
      await storage.saveFile({
        ...entry,
        run: { ...entry.run, status: "CANCELLED" },
      });
    }
  }
}

/** Removes a desktop watch and all its history. Deletes under the processing lock so an
 *  in-flight run finishes its final write before the rows go: otherwise processFile's terminal
 *  save re-creates an orphan file row for a folder that no longer exists. */
export async function deleteLocalProcessingFolder(id: string): Promise<void> {
  await cancelLocalProcessingRuns(id);
  await navigator.locks.request(`processing:${id}`, async () => {
    for (const entry of await storage.files(id))
      await storage.deleteFile(entry.id);
    await storage.deleteFolder(id);
  });
  cancelled.delete(id);
}

/** Restores one archived input only if none of this run's outputs were subsequently edited. */
export async function revertLocalProcessingFile(
  id: string,
  name: string,
): Promise<void> {
  const folder = await requireLocalProcessingFolder(id);
  await storage.saveFolder({ ...folder, enabled: false });
  const entry = (await storage.files(id)).find(
    (file) => file.input.name === name,
  );
  if (
    !entry?.originalPath ||
    !TERMINAL.has(entry.run.status) ||
    running.has(id)
  ) {
    throw new Error("Wait for processing to finish before restoring this file");
  }
  for (const output of entry.outputs)
    await requireUnchangedProcessingFile(output);
  const replacement = entry.outputs.find(
    (output) => output.path === entry.input.path,
  );
  if (replacement) {
    await replaceProcessingFile(
      replacement,
      await readProcessingOriginal(entry.originalPath),
    );
  }
  for (const output of entry.outputs) {
    if (output.path !== entry.input.path) await remove(output.path);
  }
  await remove(entry.originalPath);
  await storage.deleteFile(entry.id);
}

/** Scans enabled desktop folders while signed in. Each folder keeps at most one active upload. */
export async function scanLocalProcessingFolders(): Promise<void> {
  for (const folder of await localProcessingFolders()) {
    if (folder.enabled && !running.has(folder.id)) {
      await sweepLocalProcessingFolder(folder.id, false).catch(() => {});
    } else if (
      !folder.enabled &&
      !running.has(folder.id) &&
      (await storage.files(folder.id)).some(
        (entry) => entry.serverRunId && !TERMINAL.has(entry.run.status),
      )
    ) {
      startDrain(folder.id, false);
    }
  }
}
