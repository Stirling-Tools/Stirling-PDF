/**
 * The generic "browser-side fast path" seam. A policy may declare a {@link LocalPass}: cheap local
 * work that runs before any server dispatch and can settle a file on its own, or decide the server
 * run is still needed. The local-pass engine ({@link ../../hooks/usePolicyLocalPasses}) runs it
 * without knowing what it computes; the policy-specific logic lives entirely inside the pass.
 */

import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import { CLASSIFICATION_CATEGORY_ID } from "@app/data/classificationPolicy";
import { classificationLocalPass } from "@app/components/policies/classificationLocalPass";

export interface LocalPassResult {
  /** Fields to merge onto the file's stub and stored metadata. Opaque to the engine. */
  stubUpdates: Partial<StirlingFileStub>;
  /** Whether the policy's server run should still be dispatched after this pass. */
  needsServerRun: boolean;
}

export interface LocalPass {
  /** Files this pass should run on (e.g. new documents it has not processed yet). */
  eligible(stub: StirlingFileStub): boolean;
  /**
   * Do the local work for one file. Returns the stub fields to write and whether the server run is
   * still needed, or null if the work could not be done and should be retried later.
   */
  run(fileId: FileId, stub: StirlingFileStub): Promise<LocalPassResult | null>;
}

/** The local fast path a policy declares, if any. The default (most policies) is none. */
export function localPassFor(categoryId: string): LocalPass | undefined {
  if (categoryId === CLASSIFICATION_CATEGORY_ID) return classificationLocalPass;
  return undefined;
}
