import type { FolderId, FolderRecord } from "@app/types/folder";
import type { PickedDirectory } from "@app/services/directoryPicker";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
} from "@app/policies/catalog";
import { policyStepFromWire, policyStepToWire } from "@app/policies/operations";
import type { PipelineStep } from "@app/policies/catalog";

/** New folders are materialised only when the user confirms the review. */
export type ProcessingFolderTarget =
  | { kind: "existing"; folder: FolderRecord }
  | { kind: "server"; name: string; parentId: FolderId | null }
  | { kind: "local"; directory: PickedDirectory; name: string | null };

/** Configured portal policies come first; availability keeps the remaining portal order stable. */
export function sortFolderPresets(
  catalogue: CatalogueEntry[],
): CatalogueEntry[] {
  return [...catalogue].sort(
    (a, b) =>
      Number(Boolean(b.policy)) - Number(Boolean(a.policy)) ||
      Number(Boolean(a.category.comingSoon)) -
        Number(Boolean(b.category.comingSoon)),
  );
}

/** The saved processing chain behind a configured portal preset. */
export function presetProcessingRecord(
  entry: CatalogueEntry,
): ProcessingRecordSummary | undefined {
  return entry.policy
    ? {
        id: entry.policy.state.backendId ?? entry.category.id,
        enabled: entry.policy.state.status === "active",
        steps: entry.policy.steps,
      }
    : undefined;
}

/** The simple form cannot safely edit unknown operations or repeated instances of a tool. */
export function canEditFolderSteps(record: ProcessingRecordSummary): boolean {
  const ids = record.steps.map((step) => policyStepFromWire(step)?.toolId);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

/** Retains assets and parameters outside the form while applying edits to fields it owns. */
export function mergeFolderSteps(
  saved: ProcessingRecordSummary | undefined,
  steps: PipelineStep[],
): ProcessingRecordSummary["steps"] {
  return steps.map((step) => {
    const original = saved?.steps.find(
      (item) => item.operation === step.operation,
    );
    if (!original) return step;
    const parsed = policyStepFromWire(original);
    if (!parsed) return step;
    const baseline = policyStepToWire(parsed).parameters;
    const parameters = { ...original.parameters };
    for (const name of Object.keys(baseline)) {
      if (!(name in step.parameters)) delete parameters[name];
    }
    return {
      ...original,
      ...step,
      parameters: { ...parameters, ...step.parameters },
    };
  });
}

/** Saved steps retain their order and parameters, including chains spanning presets. */
export function folderSetupEntry(
  preset: CatalogueEntry,
  existing?: ProcessingRecordSummary,
): CatalogueEntry {
  const record = existing ?? presetProcessingRecord(preset);
  const savedTools =
    record?.steps.flatMap((step) => {
      const tool = policyStepFromWire(step);
      return tool ? [tool] : [];
    }) ?? [];
  const savedIds = new Set(savedTools.map((tool) => tool.toolId));
  const matchingPreset =
    savedTools.length > 0
      ? POLICY_CATEGORIES.find((preset) =>
          savedTools.every((tool) =>
            POLICY_CONFIG[preset.id].defaultOperations.some(
              (candidate) => candidate.toolId === tool.toolId,
            ),
          ),
        )
      : undefined;
  const category = (existing ? matchingPreset : undefined) ?? preset.category;
  const config = POLICY_CONFIG[category.id];
  if (!record) return preset;
  const savedConfig = {
    ...config,
    defaultOperations: [
      ...savedTools,
      ...(matchingPreset
        ? config.defaultOperations.filter((tool) => !savedIds.has(tool.toolId))
        : []),
    ],
  };
  return {
    category,
    config: savedConfig,
    policy: {
      category,
      config: savedConfig,
      state: {
        configured: true,
        status: record.enabled ? "active" : "paused",
        required: false,
        sources: [],
        scopeTypes: [],
        reviewerEmail: "",
        fieldValues: {},
      },
      steps: record.steps,
      stats: { enforced: 0, dataProcessed: "", activeFor: "" },
      activity: [],
    },
  };
}

/** Full paths distinguish identically named folders in different parents. */
export function processingFolderPath(
  folder: FolderRecord,
  folders: FolderRecord[],
): string {
  if (folder.directory) return folder.directory;
  const names = [folder.name];
  const seen = new Set<FolderId>([folder.id]);
  let parentId = folder.parentFolderId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = folders.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentFolderId;
  }
  return names.join(" / ");
}
