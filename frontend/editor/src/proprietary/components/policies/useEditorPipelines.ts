import { useEffect, useMemo, useState } from "react";
import { loadPolicies, onPoliciesChange } from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { editorTriggerOf, type PolicyRunOn } from "@app/policies/runOn";
import {
  usePolicyRuns,
  isRunInFlight,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import type { PoliciesByKey } from "@app/types/policies";

export interface EditorPipeline {
  policyKey: string;
  label: string;
  runOn: PolicyRunOn;
  running: boolean;
  failed: boolean;
  runsToday: number;
}

export interface EditorPipelines {
  onImport: EditorPipeline[];
  onExport: EditorPipeline[];
  total: number;
}

function pipelineLabel(
  policyKey: string,
  policies: PoliciesByKey,
  categoryLabels: Map<string, string>,
): string {
  return (
    categoryLabels.get(policyKey) ?? policies[policyKey]?.name ?? policyKey
  );
}

function describeRuns(runs: PolicyRunRecord[], since: number) {
  const running = runs.some(isRunInFlight);
  const settled = runs.filter((r) => !isRunInFlight(r));
  return {
    running,
    failed: !running && settled[0]?.status === "FAILED",
    runsToday: runs.filter((r) => r.startedAt >= since).length,
  };
}

export function useEditorPipelines(): EditorPipelines {
  const [policies, setPolicies] = useState<PoliciesByKey>(loadPolicies);
  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);
  const runs = usePolicyRuns();

  return useMemo(() => {
    const categoryLabels = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const runsByPolicy = new Map<string, PolicyRunRecord[]>();
    for (const run of runs) {
      const bucket = runsByPolicy.get(run.policyKey);
      if (bucket) bucket.push(run);
      else runsByPolicy.set(run.policyKey, [run]);
    }

    const onImport: EditorPipeline[] = [];
    const onExport: EditorPipeline[] = [];
    const entries = Object.entries(policies).sort(
      ([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0),
    );

    for (const [policyKey, state] of entries) {
      const runOn = editorTriggerOf(state);
      if (!runOn) continue;
      const pipeline: EditorPipeline = {
        policyKey,
        label: pipelineLabel(policyKey, policies, categoryLabels),
        runOn,
        ...describeRuns(runsByPolicy.get(policyKey) ?? [], startOfDay),
      };
      (runOn === "export" ? onExport : onImport).push(pipeline);
    }

    return {
      onImport,
      onExport,
      total: onImport.length + onExport.length,
    };
  }, [policies, runs]);
}
