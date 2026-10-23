import type { StirlingFileStub } from "@editor/types/fileContext";
import type { PolicyState } from "@editor/types/policies";
import { toolIOFor } from "@editor/types/toolIO";
import { toolAcceptsFile } from "@editor/utils/toolIOCompat";

/** Automatic enforcement requires a known first step that accepts the current file. */
export function policyAcceptsFile(
  policy: Pick<PolicyState, "firstOperation"> | undefined,
  file: Pick<StirlingFileStub, "name" | "type" | "processedFile">,
): boolean {
  const operation = policy?.firstOperation;
  return Boolean(
    operation && toolIOFor(operation) && toolAcceptsFile(operation, file),
  );
}
