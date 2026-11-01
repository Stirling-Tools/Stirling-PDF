import { useCallback, useRef } from "react";
import { useFileSelector } from "@editor/contexts/FileContext";
import type {
  FileId,
  StirlingFile,
  StirlingFileStub,
} from "@editor/types/fileContext";

export interface UnreducedOutputs {
  unreduced: number;
  total: number;
}

/**
 * Counts outputs that are no smaller than the input they replaced, matching each
 * output to its input through the version chain's parentFileId.
 */
export function countUnreducedOutputs(
  inputSizes: ReadonlyMap<FileId, number>,
  outputs: ReadonlyArray<StirlingFileStub | undefined>,
): UnreducedOutputs {
  let unreduced = 0;
  let total = 0;
  for (const output of outputs) {
    const inputSize = output?.parentFileId
      ? inputSizes.get(output.parentFileId)
      : undefined;
    if (output === undefined || inputSize === undefined) continue;
    total++;
    if (output.size >= inputSize) unreduced++;
  }
  return { unreduced, total };
}

/**
 * Tracks which compress results did not shrink. Call recordInputs with the files
 * about to be compressed: the inputs leave FileContext once their outputs replace
 * them, so their sizes are not recoverable afterwards.
 */
export function useUnreducedOutputs(
  outputFileIds: readonly string[] | null | undefined,
) {
  const inputSizesRef = useRef<ReadonlyMap<FileId, number>>(new Map());

  const recordInputs = useCallback((files: readonly StirlingFile[]) => {
    inputSizesRef.current = new Map(files.map((f) => [f.fileId, f.size]));
  }, []);

  const result = useFileSelector(
    (state) =>
      countUnreducedOutputs(
        inputSizesRef.current,
        (outputFileIds ?? []).map((id) => state.files.byId[id as FileId]),
      ),
    (a, b) => a.unreduced === b.unreduced && a.total === b.total,
  );

  return { ...result, recordInputs };
}
