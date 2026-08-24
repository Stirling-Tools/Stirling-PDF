/**
 * A successful tool run can BE the fix an open failure was waiting for: unlocking a
 * password-protected document is the resolution the bell offers as "Decrypt and retry",
 * whether the user reached it through the bell or through the tool itself. This seam lets
 * a build that records failures notice that and carry the resolution through, instead of
 * leaving a row open about a problem the user has already fixed.
 *
 * Core records no failures, so there is nothing to continue and the stub does nothing.
 */

/** One output of a successful tool run, paired with the input it came from where that is known. */
export interface ToolRunOutput {
  file: File;
  /** The workspace id the output landed under, or null when it was not adopted. */
  fileId: string | null;
  /**
   * The input that produced this output, for tools that version their input. Null where
   * outputs are independent artifacts (merge, split), which no failure row can be paired to.
   */
  sourceFileId: string | null;
}

/** A tool run that completed, as the failure system needs to see it. */
export interface SucceededToolRun {
  /** The tool that ran, e.g. "removePassword". */
  operation: string;
  inputFileIds: string[];
  outputs: ToolRunOutput[];
}

/**
 * The continuation to call after a tool run succeeds. Fire-and-forget by design: whatever
 * it does must never disturb the tool's own success handling.
 */
export function useResolutionContinuation(): (run: SucceededToolRun) => void {
  return () => {};
}
