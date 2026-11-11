import { invoke } from "@tauri-apps/api/core";

// Pops of the launch queue still awaiting their answer: until one comes back,
// nothing says whether it carried files.
const pops = new Set<Promise<unknown>>();
// Batches popped with files that have not reached the workbench yet.
let loading = 0;

/** Registers a pop of the launch queue, so a restore waits to see what it carries. */
export function trackLaunchFilePop<T>(pop: Promise<T>): Promise<T> {
  pops.add(pop);
  void pop.finally(() => pops.delete(pop)).catch(() => {});
  return pop;
}

/** A pop came back with files; they are now on their way into the workbench. */
export function beginLoadingLaunchFiles(): void {
  loading++;
}

/** Those files reached the workbench, failed to, or were superseded. */
export function endLoadingLaunchFiles(): void {
  loading = Math.max(0, loading - 1);
}

/**
 * Whether files the OS handed this app ("open with") are on their way in.
 * Session restoration can reopen files, but must leave incoming files' selection and view alone.
 */
export async function launchFilesPending(): Promise<boolean> {
  await Promise.allSettled([...pops]);
  if (loading > 0) return true;
  try {
    // A peek: popping here would take the files from the window they are for.
    return (await invoke<string[]>("get_opened_files")).length > 0;
  } catch {
    return false;
  }
}
