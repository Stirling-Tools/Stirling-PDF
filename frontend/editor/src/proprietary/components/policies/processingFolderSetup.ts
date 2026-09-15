import {
  folderKind,
  type FolderId,
  type FolderRecord,
} from "@app/types/folder";
import type { PickedDirectory } from "@app/services/directoryPicker";
import { directoryKey } from "@app/services/localFolderStorage";
import { getFolderPath } from "@app/utils/folderPath";
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

/** Native selections of an existing mount must surface its saved processing before confirmation. */
export function processingFolderForTarget(
  target: ProcessingFolderTarget | null,
  folders: FolderRecord[],
): FolderRecord | undefined {
  if (target?.kind === "existing") return target.folder;
  if (target?.kind !== "local" || target.name !== null) return undefined;
  const directory = directoryKey(target.directory.path);
  return folders.find(
    (folder) =>
      folderKind(folder) === "local" &&
      folder.directory !== undefined &&
      directoryKey(folder.directory) === directory,
  );
}

/** A processing-folder name is a non-empty path segment, not a directory path. */
export function isValidProcessingFolderName(name: string): boolean {
  const trimmed = name.trim();
  return (
    Boolean(trimmed) && !/[\\/]/.test(name) && ![".", ".."].includes(trimmed)
  );
}

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
        categoryId: entry.category.id,
        outputIds: entry.policy.state.outputIds,
        routingRules: entry.policy.state.routingRules,
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
  if (!record) return preset;
  if (!existing) {
    const canonical = preset.config.defaultOperations.map(
      (tool) => tool.toolId,
    );
    const saved = record.steps.map((step) => policyStepFromWire(step)?.toolId);
    const expected = canonical.filter((id) => saved.includes(id));
    if (
      saved.length === expected.length &&
      saved.every((id, index) => id === expected[index])
    )
      return preset;
  }
  const savedTools = record.steps.flatMap((step) => {
    const tool = policyStepFromWire(step);
    return tool ? [tool] : [];
  });
  const savedIds = new Set(savedTools.map((tool) => tool.toolId));
  const matchingPreset =
    (record.categoryId
      ? POLICY_CATEGORIES.find((category) => category.id === record.categoryId)
      : undefined) ??
    (record.routingRules?.length || record.outputIds?.length
      ? POLICY_CATEGORIES.find((category) => category.id === "routing")
      : undefined) ??
    (savedTools.length > 0
      ? POLICY_CATEGORIES.find((preset) =>
          savedTools.every((tool) =>
            POLICY_CONFIG[preset.id].defaultOperations.some(
              (candidate) => candidate.toolId === tool.toolId,
            ),
          ),
        )
      : undefined);
  const category = (existing ? matchingPreset : undefined) ?? preset.category;
  const config = POLICY_CONFIG[category.id];
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
        backendId: record.id,
        configured: true,
        status: record.enabled ? "active" : "paused",
        required: false,
        sources: [],
        scopeTypes: [],
        reviewerEmail: "",
        fieldValues: {},
        ...(!existing ? preset.policy?.state : undefined),
        outputIds: record.outputIds,
        routingRules: record.routingRules,
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
  const byId = new Map(folders.map((item) => [item.id, item]));
  byId.set(folder.id, folder);
  return getFolderPath(folder.id, byId);
}
