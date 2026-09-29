import { FileId } from "@app/types/fileContext";

// Bridge from the non-React hydration path to a modal, mirroring the toast
// seam. A divergence is a decision, so it must not be dismissable like a toast.

export interface DiskConflictRequest {
  fileId: FileId;
  name: string;
  /** Swap the workbench copy for the disk one. Nothing happens if unused. */
  onUseDisk: () => void;
}

type Listener = (queue: DiskConflictRequest[]) => void;

const queue: DiskConflictRequest[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = [...queue];
  for (const listener of listeners) listener(snapshot);
}

/** Queue a conflict. Same file twice is ignored so a re-check cannot stack up. */
export function requestDiskConflictChoice(request: DiskConflictRequest): void {
  if (queue.some((q) => q.fileId === request.fileId)) return;
  queue.push(request);
  emit();
}

export function subscribeDiskConflicts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...queue]);
  return () => listeners.delete(listener);
}

/** Answer the front of the queue. "disk" runs the swap; "mine" just clears it. */
export function resolveDiskConflict(choice: "mine" | "disk"): void {
  const request = queue.shift();
  if (!request) return;
  if (choice === "disk") {
    try {
      request.onUseDisk();
    } catch (error) {
      console.error("[diskConflictPrompt] use-disk failed:", error);
    }
  }
  emit();
}

/** Drop a queued conflict without answering, e.g. the file was closed. */
export function cancelDiskConflict(fileId: FileId): void {
  const at = queue.findIndex((q) => q.fileId === fileId);
  if (at === -1) return;
  queue.splice(at, 1);
  emit();
}

/** Test seam: the queue is module state and would leak between cases. */
export function __resetDiskConflicts(): void {
  queue.length = 0;
  listeners.clear();
}
