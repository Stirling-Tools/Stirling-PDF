// A successful tool run can BE an open failure's fix. Core records none, so this is a stub.

/** One output of a successful tool run, paired with the input it came from where that is known. */
export interface ToolRunOutput {
  file: File;
  /** The workspace id the output landed under, or null when it was not adopted. */
  fileId: string | null;
  /** Null where outputs are independent artifacts (merge, split), so nothing can be paired. */
  sourceFileId: string | null;
}

/** A tool run that completed, as the failure system needs to see it. */
export interface SucceededToolRun {
  operation: string;
  inputFileIds: string[];
  outputs: ToolRunOutput[];
}

/** Fire-and-forget: whatever it does must never disturb the tool's own success handling. */
export function useResolutionContinuation(): (run: SucceededToolRun) => void {
  return () => {};
}
