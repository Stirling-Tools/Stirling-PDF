import { useCallback } from "react";
import { useAllFiles, useFileSelector } from "@app/contexts/FileContext";
import { usePolicies } from "@app/hooks/usePolicies";
import { runPolicyOnFile } from "@app/services/policyDispatch";
import type { FileId } from "@app/types/file";
import type { PolicyRecovery } from "@core/hooks/usePolicyRecovery";

export type { PolicyRecovery };

/** Re-run the policy blocking a file, backed by the dispatch engine. */
export function usePolicyRecovery(): PolicyRecovery {
  const policyBlocks = useFileSelector((s) => s.ui.policyBlocks);
  const { fileStubs } = useAllFiles();
  const { policies } = usePolicies();

  const reRunPolicy = useCallback(
    (fileId: FileId) => {
      const policyKey = policyBlocks[fileId];
      if (!policyKey) return;
      const backendId = policies[policyKey]?.backendId;
      if (!backendId) return;
      const name =
        fileStubs.find((s) => (s.id as string) === (fileId as string))?.name ??
        "";
      void runPolicyOnFile(policyKey, backendId, fileId, name);
    },
    [policyBlocks, policies, fileStubs],
  );

  return { reRunPolicy };
}
