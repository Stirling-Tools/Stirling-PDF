/**
 * Fire a single backend policy run for one file and record it. Shared by the auto-run engine (which
 * dispatches file-producing policies and their chain) and the classification policy (which dispatches
 * its own AI escalation), so both take one bounded dispatch slot and record runs the same way.
 */

import { fileStorage } from "@app/services/fileStorage";
import {
  runStoredPolicy,
  resolvePolicyRunTarget,
} from "@app/services/policyApi";
import {
  acquireDispatchSlot,
  releaseDispatchSlot,
} from "@app/components/policies/dispatchSemaphore";
import {
  markDispatched,
  recordRunStart,
} from "@app/components/policies/policyRunStore";
import type { FileId } from "@app/types/file";
import type { StirlingFile } from "@app/types/fileContext";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import { generateId } from "@app/utils/generateId";

/** Wait for an upload's bytes to land in IndexedDB (~5s): the stub surfaces in the
 *  file list before its bytes are committed, so an eager fetch would miss the file. */
const FILE_WAIT_TRIES = 20;
const FILE_WAIT_MS = 250;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dispatch a file and record the attempt, including request failures so required policies block it. */
export async function runPolicyOnFile(
  policyKey: string,
  backendId: string,
  fileId: FileId,
  fileName: string,
  // Chained (downstream) dispatch — jumps the dispatch queue so a file mid-chain
  // finishes its flow before new files start (see acquireDispatchSlot).
  priority = false,
): Promise<void> {
  // A freshly-uploaded file's bytes are written to IndexedDB asynchronously, so
  // its stub can appear in the file list a beat before getStirlingFile resolves
  // it. Wait briefly rather than bail — and DON'T mark dispatched until we hold
  // the file, or a too-early miss would skip enforcement on that file forever.
  // (The caller's in-flight guard prevents double-dispatch during this wait.)
  // A transient IndexedDB error is treated as a miss (not a throw), so it retries
  // and then marks dispatched rather than rejecting into a hot re-dispatch loop.
  const tryGetFile = async (): Promise<StirlingFile | null> => {
    try {
      return await fileStorage.getStirlingFile(fileId);
    } catch {
      return null;
    }
  };
  let file = await tryGetFile();
  for (let i = 0; i < FILE_WAIT_TRIES && !file; i++) {
    await delay(FILE_WAIT_MS);
    file = await tryGetFile();
  }
  if (!file) {
    // File genuinely gone (removed before it could run) — mark so we don't loop.
    markDispatched(policyKey, fileId);
    return;
  }
  // Bounded upload window — see MAX_CONCURRENT_DISPATCHES. Only the POST is
  // gated; the IDB wait above never holds a slot.
  const target = resolvePolicyRunTarget();
  await acquireDispatchSlot(priority);
  const startedAt = Date.now();
  try {
    // Recorded against a document this browser can resolve. One file per run, which is the only
    // shape the server keeps a reference for.
    const runId = await runStoredPolicy(backendId, [file], fileId);
    // recordRunStart marks this (policy, file) dispatched as it records the run.
    recordRunStart({
      runId,
      policyKey,
      fileId,
      fileName,
      fileSize: file.size,
      target,
      status: "PENDING",
      outputs: [],
      error: null,
      startedAt,
    });
  } catch (err) {
    // No server run ID is available. The terminal local record blocks required-policy inputs
    // and exposes manual recovery without sending status polls for an invented server run.
    recordRunStart({
      runId: `dispatch-failed:${generateId()}`,
      policyKey,
      fileId,
      fileName,
      fileSize: file.size,
      target,
      status: "FAILED",
      outputs: [],
      error: extractErrorMessage(err),
      startedAt,
    });
    console.debug(
      `[PolicyAutoRun] Failed to dispatch policy ${policyKey} (${backendId}):`,
      err,
    );
  } finally {
    releaseDispatchSlot();
  }
}
