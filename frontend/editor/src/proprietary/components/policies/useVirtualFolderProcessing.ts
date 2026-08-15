/**
 * Client-side engine for virtual (browser-owned) processing folders.
 *
 * A virtual folder's files live only in this browser's IndexedDB, so the
 * server's folder watchers can never reach them. When such a folder has
 * processing enabled, this loop plays the watcher: it finds the folder's
 * unprocessed files, uploads each through an ad-hoc pipeline run
 * (`POST /api/v1/policies/run` — the same engine stored policies use), and
 * delivers the output back into IndexedDB as a new version of the input.
 * The versioned child inherits the input's folderId, so results stay in the
 * folder they came from.
 *
 * Runs only while the AI engine is on: the pipeline's steps execute
 * server-side (classification needs the engine), and with AI off the
 * browser-side classifier (useClientSideClassification) covers these folders
 * instead — the same split the org-wide Classification policy uses.
 *
 * Each (folder, file) pair is dispatched once, tracked in the shared
 * dispatched-markers store; outputs are stamped `derivedFromTool`, the durable
 * guard that stops the loop re-processing its own results.
 */

import { useEffect, useRef, useState } from "react";
import { useFolders } from "@app/contexts/FolderContext";
import { useAllFiles, useFileContext } from "@app/contexts/FileContext";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { fileStorage } from "@app/services/fileStorage";
import {
  downloadPolicyOutput,
  getPolicyRun,
  resolvePolicyRunTarget,
  runPolicyPipeline,
} from "@app/services/policyApi";
import type { PolicyRunView } from "@app/services/policyPipeline";
import { readClassificationLabelsFromFile } from "@app/services/fileClassification";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import {
  isDispatched,
  markDispatched,
} from "@app/components/policies/policyRunStore";
import { folderKind, type FolderRecord } from "@app/types/folder";
import type { FileId } from "@app/types/file";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";

const POLL_MS = 2000;
/** Per-step budget mirroring the server's own step timeout, plus slack. */
const STEP_TIMEOUT_MS = 300_000;
const POLL_GRACE_MS = 30_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dispatch-marker namespace: one category per processing folder. */
function categoryFor(folderId: string): string {
  return `processing-folder:${folderId}`;
}

/** Poll an ad-hoc run to a terminal state, or null if the budget runs out. */
async function waitForRun(runId: string): Promise<PolicyRunView | null> {
  let budgetMs = STEP_TIMEOUT_MS + POLL_GRACE_MS;
  const startedAt = Date.now();
  while (Date.now() - startedAt < budgetMs) {
    await delay(POLL_MS);
    let view: PolicyRunView;
    try {
      view = await getPolicyRun(runId);
    } catch {
      continue; // transient; the budget bounds it
    }
    if (view.stepCount > 0) {
      budgetMs = view.stepCount * STEP_TIMEOUT_MS + POLL_GRACE_MS;
    }
    if (
      view.status === "COMPLETED" ||
      view.status === "FAILED" ||
      view.status === "CANCELLED"
    ) {
      return view;
    }
  }
  return null;
}

interface DeliveryContext {
  /** Live workspace stubs, read at delivery time (never a dependency). */
  workspaceStubs: () => ReadonlyArray<StirlingFileStub>;
  consumeFiles: (
    inputFileIds: FileId[],
    outputs: StirlingFile[],
    stubs: StirlingFileStub[],
    options?: { silent?: boolean },
  ) => Promise<unknown>;
  bumpRevision: () => void;
}

/**
 * Version the input with the run's outputs — in the workspace when the file is
 * open there (so the views update in place), else directly at the storage
 * layer. Labels are read off the output PDF and stamped on the child stub so
 * the sidebar groups it immediately.
 */
async function deliverOutputs(
  stub: StirlingFileStub,
  view: PolicyRunView,
  ctx: DeliveryContext,
): Promise<void> {
  const target = resolvePolicyRunTarget();
  const files: File[] = [];
  for (const output of view.outputs) {
    const blob = await downloadPolicyOutput(output.fileId, target);
    files.push(
      new File([blob], stub.name, { type: blob.type || "application/pdf" }),
    );
  }
  if (files.length === 0) return;
  const parentStub = (await fileStorage.getStirlingFileStub(stub.id)) ?? stub;
  const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
    files,
    parentStub,
    "automate",
  );
  const finalStubs = await Promise.all(
    stubs.map(async (child, i) => {
      const labels =
        (await readClassificationLabelsFromFile(files[i]!)) ?? undefined;
      return {
        ...child,
        derivedFromTool: true,
        ...(labels ? { classificationLabels: labels } : {}),
      };
    }),
  );
  const inWorkspace = ctx
    .workspaceStubs()
    .some((w) => (w.id as string) === (stub.id as string));
  if (inWorkspace) {
    await ctx.consumeFiles([stub.id], stirlingFiles, finalStubs, {
      silent: true,
    });
  } else {
    await fileStorage.persistVersionedOutputs(
      [stub.id],
      stirlingFiles,
      finalStubs,
    );
    ctx.bumpRevision();
  }
}

export function useVirtualFolderProcessing(): void {
  const { folders } = useFolders();
  const { fileStubs } = useAllFiles();
  const { consumeFiles } = useFileContext();
  const { bumpRevision } = useIndexedDB();
  const revision = useIndexedDBRevision();
  const aiEnabled = useAiEngineEnabled();

  // Workspace stubs read via a ref: delivery mutates them, and depending on
  // them would make the scan re-trigger on its own deliveries.
  const fileStubsRef = useRef(fileStubs);
  fileStubsRef.current = fileStubs;
  // One scan at a time. A running scan's own deliveries bump the revision and
  // re-fire the effect, so the re-fire queues a follow-up scan instead of
  // cancelling the one in flight — cancelling there would strand every file
  // after the first delivery until some unrelated write happened along.
  const scanning = useRef(false);
  const rescanQueued = useRef(false);
  const unmounted = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  useEffect(() => {
    if (!aiEnabled) return;
    const enabled = folders.filter(
      (folder) =>
        folderKind(folder) === "virtual" &&
        folder.processing?.enabled &&
        folder.processing.steps.length > 0,
    );
    if (enabled.length === 0) return;
    if (scanning.current) {
      rescanQueued.current = true;
      return;
    }
    scanning.current = true;

    void (async () => {
      try {
        const all = await fileStorage.getAllStirlingFileStubs();
        for (const folder of enabled) {
          const category = categoryFor(folder.id as string);
          const pending = all.filter(
            (stub) =>
              (stub.folderId ?? null) === (folder.id as string) &&
              stub.isLeaf &&
              !stub.derivedFromTool &&
              !isDispatched(category, stub.id as string),
          );
          for (const stub of pending) {
            if (unmounted.current) return;
            await processOne(folder, stub, category, {
              workspaceStubs: () => fileStubsRef.current,
              consumeFiles,
              bumpRevision,
            });
          }
        }
      } finally {
        scanning.current = false;
        // Anything that changed mid-scan (deliveries included) gets one full
        // follow-up pass; a clean follow-up finds nothing pending and stops.
        if (!unmounted.current && rescanQueued.current) {
          rescanQueued.current = false;
          setTick((n) => n + 1);
        }
      }
    })();
    // `revision` re-scans after any IndexedDB write — that is how a file
    // moved or uploaded into the folder gets picked up. No cleanup cancels
    // the loop: it must outlive re-renders its own deliveries cause, and
    // only unmount stops it.
  }, [folders, revision, aiEnabled, tick, consumeFiles, bumpRevision]);
}

/** Run one file through its folder's pipeline and deliver the result. */
async function processOne(
  folder: FolderRecord,
  stub: StirlingFileStub,
  category: string,
  ctx: DeliveryContext,
): Promise<void> {
  const file = await fileStorage.getStirlingFile(stub.id).catch(() => null);
  if (!file) {
    // Removed since listing; never coming back under this id.
    markDispatched(category, stub.id as string);
    return;
  }
  try {
    const runId = await runPolicyPipeline(
      {
        name: `Processing folder: ${folder.name}`,
        steps: folder.processing!.steps.map((step) => ({
          operation: step.operation,
          parameters: step.parameters,
        })),
        outputs: [{ type: "inline", options: {} }],
      },
      [file],
    );
    // Marked at dispatch (not delivery): a delivery failure must not re-run
    // the pipeline — the run happened, and re-firing it would double-process.
    markDispatched(category, stub.id as string);
    const view = await waitForRun(runId);
    if (view?.status === "COMPLETED") {
      await deliverOutputs(stub, view, ctx);
    } else if (view) {
      console.warn(
        `[VirtualFolderProcessing] run for ${stub.name} ended ${view.status}`,
        view.error,
      );
    }
  } catch (err) {
    // Dispatch or delivery failed. Marked either way so a broken file can't
    // wedge the folder in a re-dispatch loop; a new version retries naturally.
    markDispatched(category, stub.id as string);
    console.warn(
      `[VirtualFolderProcessing] could not process ${stub.name}`,
      err,
    );
  }
}
