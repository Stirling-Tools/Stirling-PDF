import {
  getPolicyRunOutcomes,
  type PolicyRunOutcome,
} from "@app/components/policies/policyRunStore";
import { loadPolicies } from "@app/services/policyStorage";
import { policySourceIds } from "@core/services/policyBlockRegistry";
import type { StirlingFileStub } from "@app/types/fileContext";
export { policySourceIds };

/** A failed policy and the open documents derived from its input. */
export interface PolicyRecoveryBlock {
  outcome: PolicyRunOutcome;
  affectedFiles: StirlingFileStub[];
}

let readWorkspace: () => StirlingFileStub[] = () => [];
const fileUsages = new Map<symbol, StirlingFileStub[]>();
const usageListeners = new Set<() => void>();
let usageVersion = 0;

/** Register documents retained outside the workspace until their owning tool releases them. */
export function registerPolicyFileUsage(files: StirlingFileStub[]): () => void {
  const owner = Symbol();
  const emit = () => {
    usageVersion += 1;
    usageListeners.forEach((listener) => listener());
  };
  fileUsages.set(owner, files);
  emit();
  return () => {
    fileUsages.delete(owner);
    emit();
  };
}

/** Subscribe to retained-document changes, independently of policy polling. */
export function subscribePolicyFileUsage(listener: () => void): () => void {
  usageListeners.add(listener);
  return () => {
    usageListeners.delete(listener);
  };
}

/** Stable external-store snapshot for retained-document registrations. */
export function policyFileUsageVersion(): number {
  return usageVersion;
}

/** Bind the mounted editor's live selectors; cleanup releases its document references. */
export function registerPolicyWorkspace(
  read: () => StirlingFileStub[],
): () => void {
  readWorkspace = read;
  return () => {
    if (readWorkspace === read) readWorkspace = () => [];
  };
}

/** Durable failures remain blocking through retries, cancellation and activity-log eviction. */
export function getWorkspacePolicyBlocks(
  files = readWorkspace(),
): PolicyRecoveryBlock[] {
  const policies = loadPolicies();
  const openFiles = [
    ...new Map(
      [...files, ...Array.from(fileUsages.values()).flat()].map((file) => [
        file.id,
        file,
      ]),
    ).values(),
  ];
  return Object.values(getPolicyRunOutcomes()).flatMap((outcome) => {
    if (outcome.status !== "FAILED" || !policies[outcome.policyKey]?.required)
      return [];
    const affectedFiles = openFiles.filter((file) =>
      policySourceIds(file).includes(outcome.fileId),
    );
    return affectedFiles.length ? [{ outcome, affectedFiles }] : [];
  });
}

/** Read the durable result, including for files closed out of the workspace. */
export function isFileBlocked(fileId: string): boolean {
  const policies = loadPolicies();
  return Object.values(getPolicyRunOutcomes()).some(
    (outcome) =>
      outcome.fileId === fileId &&
      outcome.status === "FAILED" &&
      policies[outcome.policyKey]?.required,
  );
}

/** Checks live file state and outcomes without waiting for a React effect. */
export function isEditorPolicyBlocked(): boolean {
  return getWorkspacePolicyBlocks().length > 0;
}
