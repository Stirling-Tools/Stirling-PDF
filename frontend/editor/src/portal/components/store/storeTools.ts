import type { TFunction } from "i18next";
import type { ToolRegistry, ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";
import { humanizeEndpoint } from "@portal/api/policies";
import type {
  StoreFinding,
  StoreFindingWhere,
  StoreManifest,
  StoreRequiredOnInstall,
} from "@portal/api/store";

/**
 * Pure helpers behind the store screens: mapping a listing's operation paths back to registry
 * tools, bucketing the server's preflight findings, and the install-target wording that follows
 * the build flavour. Kept free of React so they can be unit-tested directly.
 */

export interface ResolvedTool {
  toolId: ToolId;
  entry: ToolRegistryEntry;
}

/**
 * The registry tool an operation path belongs to: a static endpoint that equals it, or a dynamic
 * tool whose declared endpoint set contains it. Null when no tool models that endpoint.
 */
export function findToolForOperation(
  operation: string,
  registry: Partial<ToolRegistry>,
): ResolvedTool | null {
  for (const [id, entry] of Object.entries(registry)) {
    const config = entry?.operationConfig;
    if (!config || !entry) continue;
    if (typeof config.endpoint === "string" && config.endpoint === operation) {
      return { toolId: id as ToolId, entry };
    }
    if (config.endpoints?.some((endpoint) => endpoint === operation)) {
      return { toolId: id as ToolId, entry };
    }
  }
  return null;
}

/** Display name for an operation: the registry tool's name, else the humanised endpoint. */
export function operationLabel(
  operation: string,
  registry: Partial<ToolRegistry>,
  t: TFunction,
): string {
  return (
    findToolForOperation(operation, registry)?.entry.name ??
    humanizeEndpoint(operation, t)
  );
}

export interface GroupedFindings {
  block: StoreFinding[];
  warn: StoreFinding[];
  info: StoreFinding[];
}

/** Findings by severity, in the order the Checks step shows them. */
export function groupFindings(findings: StoreFinding[]): GroupedFindings {
  const groups: GroupedFindings = { block: [], warn: [], info: [] };
  for (const finding of findings) groups[finding.severity].push(finding);
  return groups;
}

/** The Install button's label key: the SaaS build installs to the team, self-hosted to this server. */
export function installTargetLabelKey(saasBuild: boolean): string {
  return saasBuild
    ? "portal.store.detail.installTeam"
    : "portal.store.detail.installServer";
}

/** The one-line caption under Install naming where the copy goes. */
export function installTargetCaptionKey(saasBuild: boolean): string {
  return saasBuild
    ? "portal.store.detail.installTeamCaption"
    : "portal.store.detail.installServerCaption";
}

/** "Step 3, Compress" / "Details" / "Input" / "Output" for a finding's location chip. */
export function whereLabel(
  where: StoreFindingWhere,
  registry: Partial<ToolRegistry>,
  t: TFunction,
): string {
  if (where.kind === "step") {
    const step = (where.stepIndex ?? 0) + 1;
    const tool = where.operation
      ? operationLabel(where.operation, registry, t)
      : null;
    return tool
      ? t("portal.store.findings.whereStep", { step, tool })
      : t("portal.store.findings.whereStepOnly", { step });
  }
  return t(`portal.store.findings.where.${where.kind}`);
}

/** Compact count for card footers: 999 -> "999", 1234 -> "1.2k", 1200000 -> "1.2M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Parameter names the installer must fill for one step, so the preview can mask them. */
export function requiredFieldsForStep(
  required: StoreRequiredOnInstall[],
  stepIndex: number,
): Set<string> {
  const fields = new Set<string>();
  for (const item of required) {
    if (item.kind === "parameter" && item.stepIndex === stepIndex && item.field)
      fields.add(item.field);
  }
  return fields;
}

/** A scalar parameter rendered for the read-only inspector; objects and arrays are summarised. */
export function formatParamValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string")
    return String(value);
  if (Array.isArray(value)) return value.map(formatParamValue).join(", ");
  return JSON.stringify(value);
}

/**
 * One line of the settings a step carries, for the node's detail row. Empty values are skipped
 * and installer-owned fields are left out (the inspector shows those as "Set on install").
 */
export function settingsSummary(
  parameters: Record<string, unknown>,
  hidden: Set<string>,
  maxLength = 72,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    if (hidden.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) continue;
    parts.push(`${key}: ${formatParamValue(value)}`);
  }
  const line = parts.join(", ");
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}...` : line;
}

/** The public share URL a listing is reached by outside the portal. */
export function storeShareUrl(storeId: string): string {
  return `https://stirling.com/store/p/${encodeURIComponent(storeId)}`;
}

/** Save the manifest as `{storeId}.pipeline.json` through a transient anchor. */
export function downloadManifest(manifest: StoreManifest, storeId: string) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${storeId}.pipeline.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
