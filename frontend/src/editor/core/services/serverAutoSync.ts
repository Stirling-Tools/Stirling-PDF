/**
 * Which server-backed documents have edits to push, and the sync status the
 * file cards show for them. Timing and retries belong to ServerAutoSync.
 * Nothing here pulls: a newer server copy only shows up as a refused push.
 */
import { useSyncExternalStore } from "react";
import axios from "axios";
import type { StirlingFileStub } from "@editor/types/fileContext";

export type ServerSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error";

export type ServerSyncFailure = Extract<
  ServerSyncStatus,
  "offline" | "conflict" | "error"
>;

/** A leaf holding edits that the server copy it was based on lacks. */
export function hasUnsyncedChanges(stub: StirlingFileStub): boolean {
  return stub.remoteSync !== undefined && stub.remoteSync.leafId !== stub.id;
}

/** Unsynced, and this user may replace the server copy. */
export function canAutoSync(stub: StirlingFileStub): boolean {
  return (
    stub.isLeaf !== false &&
    typeof stub.remoteStorageId === "number" &&
    stub.remoteOwnedByCurrentUser !== false &&
    !stub.remoteSharedViaLink &&
    hasUnsyncedChanges(stub)
  );
}

export function classifySyncFailure(error: unknown): ServerSyncFailure {
  if (!axios.isAxiosError(error)) return "error";
  if (!error.response) return "offline";
  return error.response.status === 409 ? "conflict" : "error";
}

// In-progress and failed states, keyed by server file id. A clean leaf is
// "synced" by its own metadata, so success just clears the entry.
const transientStatus = new Map<number, ServerSyncStatus>();
const listeners = new Set<() => void>();

export function setServerSyncStatus(
  remoteId: number,
  status: ServerSyncStatus | undefined,
): void {
  if (status === undefined) {
    transientStatus.delete(remoteId);
  } else {
    transientStatus.set(remoteId, status);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Undefined for a file that is not a synced server document's current version. */
export function useServerSyncStatus(
  stub: StirlingFileStub,
): ServerSyncStatus | undefined {
  const transient = useSyncExternalStore(subscribe, () =>
    stub.remoteStorageId === undefined
      ? undefined
      : transientStatus.get(stub.remoteStorageId),
  );
  if (!stub.remoteSync || stub.isLeaf === false) return undefined;
  if (!hasUnsyncedChanges(stub)) return "synced";
  return transient ?? "pending";
}
