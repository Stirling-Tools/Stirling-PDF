/**
 * Generic engine for policies' browser-side fast paths. Any active editor policy that declares a
 * {@link LocalPass} has it run here: eligible files are classified/processed locally, the returned
 * fields are written to the stub, and the policy's server run is dispatched only if the pass says it
 * is still needed (and the AI engine, if the policy needs it, is on).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { fileStorage } from "@app/services/fileStorage";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { scheduleIdle } from "@app/utils/scheduleIdle";
import { usePolicies } from "@app/hooks/usePolicies";
import { runPolicyOnFile } from "@app/services/policyDispatch";
import {
  localPassFor,
  type LocalPass,
} from "@app/components/policies/policyLocalPass";
import { policyRequiresAiEngine } from "@app/data/classificationPolicy";
import type { StirlingFileStub } from "@app/types/fileContext";

/** Files processed per idle pass, so a large upload drains over several ticks instead of janking. */
const LOCAL_PASS_BATCH = 3;

interface ActivePass {
  categoryId: string;
  backendId: string;
  pass: LocalPass;
  /** When true, the server run is skipped while the AI engine is off (nothing to escalate to). */
  requiresAiEngine: boolean;
}

export function usePolicyLocalPasses(): void {
  const { fileStubs } = useAllFiles();
  const { updateStirlingFileStub } = useFileManagement();
  const { bumpRevision } = useIndexedDB();
  const { policies } = usePolicies();
  const aiEnabled = useAiEngineEnabled();
  // Waited on so a verdict is not written and escalated before it is known whether the AI engine
  // (which the server run may need) is even available.
  const { loading: configLoading } = useAppConfig();
  // Files claimed this session, keyed policy+id+lastModified so a new version is retried once. Claimed
  // synchronously right before running, so overlapping batches never double-process.
  const claimed = useRef<Set<string>>(new Set());
  // Bumped after each batch to drain the next one.
  const [tick, setTick] = useState(0);

  // Active editor upload policies that declare a local fast path.
  const passes = useMemo<ActivePass[]>(() => {
    const out: ActivePass[] = [];
    for (const [categoryId, s] of Object.entries(policies)) {
      const active =
        s.configured &&
        s.enabled &&
        s.backendId &&
        s.runsOnEditor &&
        (s.runOn ?? "upload") === "upload";
      if (!active) continue;
      const pass = localPassFor(categoryId);
      if (!pass) continue;
      out.push({
        categoryId,
        backendId: s.backendId as string,
        pass,
        requiresAiEngine: policyRequiresAiEngine(categoryId),
      });
    }
    return out;
  }, [policies]);

  useEffect(() => {
    if (configLoading || passes.length === 0) return;
    const claimKey = (categoryId: string, s: StirlingFileStub) =>
      `${categoryId}:${s.id as string}:${s.lastModified ?? 0}`;
    // Collect one idle batch of pending (pass, file) work across all passes.
    const batch: { active: ActivePass; stub: StirlingFileStub }[] = [];
    outer: for (const active of passes) {
      for (const stub of fileStubs) {
        if (batch.length >= LOCAL_PASS_BATCH) break outer;
        if (!active.pass.eligible(stub)) continue;
        if (claimed.current.has(claimKey(active.categoryId, stub))) continue;
        batch.push({ active, stub });
      }
    }
    if (batch.length === 0) return;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      // Superseded before starting: the newer effect instance owns the queue.
      if (cancelled) return;
      void (async () => {
        let wrote = false;
        for (const { active, stub } of batch) {
          const key = claimKey(active.categoryId, stub);
          // Re-validate at execution time - another batch may have claimed it since.
          if (claimed.current.has(key)) continue;
          claimed.current.add(key);
          const result = await active.pass.run(stub.id, stub);
          // Could not run (e.g. bytes not in storage yet): leave unprocessed so a reload retries.
          if (result == null) continue;
          // Deliver unconditionally - a re-render must never discard a computed result. Writes are
          // idempotent. The engine applies the fields the pass returned without reading them.
          updateStirlingFileStub(stub.id, result.stubUpdates);
          const ok = await fileStorage.updateFileMetadata(
            stub.id,
            result.stubUpdates,
          );
          if (ok) wrote = true;
          // Dispatch the server run only if the pass still wants it, and skip it while an
          // AI-engine-dependent policy has no engine to reach.
          if (
            result.needsServerRun &&
            !(active.requiresAiEngine && !aiEnabled)
          ) {
            void runPolicyOnFile(
              active.categoryId,
              active.backendId,
              stub.id,
              stub.name,
            ).catch(() => {
              // Backstop: runPolicyOnFile handles its own failures.
            });
          } else {
            // No server run follows (verdict stands, or the AI engine is off so nothing can
            // escalate): this local pass is the billable run, so charge it here.
            result.meter?.();
          }
        }
        if (wrote) bumpRevision();
        // Drain the next batch; the terminal pass finds nothing pending and stops.
        setTick((n) => n + 1);
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [
    fileStubs,
    passes,
    aiEnabled,
    configLoading,
    updateStirlingFileStub,
    bumpRevision,
    tick,
  ]);
}
