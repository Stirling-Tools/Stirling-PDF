import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { updateService } from "@app/services/updateService";

export type ToolFreshnessBadge = "new" | "updated";

export interface ToolFreshnessInfo {
  badge: ToolFreshnessBadge;
  // Version the badge advertises; acknowledging it (or newer) hides the badge.
  version: string;
}

type FreshnessFields = Pick<
  ToolRegistryEntry,
  "newInVersion" | "updatedInVersion"
>;

// Badges expire on their own once the tagged release is this many minors behind.
const RECENT_MINOR_WINDOW = 1;

const STORAGE_KEY = "stirling.toolFreshness.acknowledged";

function parseMajorMinor(
  version: string,
): { major: number; minor: number } | null {
  const match = /^v?(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

// Recent = within RECENT_MINOR_WINDOW of the app's minor, or newer than the
// build itself (registry tagged ahead, e.g. dev builds reporting 0.0.0).
export function isRecentRelease(
  taggedVersion: string,
  appVersion: string | null | undefined,
): boolean {
  const tagged = parseMajorMinor(taggedVersion);
  if (!tagged) return false;
  const current = appVersion ? parseMajorMinor(appVersion) : null;
  if (!current) return true;
  if (tagged.major !== current.major) return tagged.major > current.major;
  return current.minor - tagged.minor <= RECENT_MINOR_WINDOW;
}

// Highest version the tool's registry entry is tagged with, if any.
export function latestTaggedVersion(tool: FreshnessFields): string | null {
  const { newInVersion, updatedInVersion } = tool;
  if (newInVersion && updatedInVersion) {
    return updateService.compareVersions(updatedInVersion, newInVersion) >= 0
      ? updatedInVersion
      : newInVersion;
  }
  return updatedInVersion ?? newInVersion ?? null;
}

// "New" outranks "Updated": a tool still inside its launch window is just new.
export function getToolFreshness(
  tool: FreshnessFields,
  appVersion: string | null | undefined,
): ToolFreshnessInfo | null {
  const { newInVersion, updatedInVersion } = tool;
  if (newInVersion && isRecentRelease(newInVersion, appVersion)) {
    return { badge: "new", version: latestTaggedVersion(tool) ?? newInVersion };
  }
  if (updatedInVersion && isRecentRelease(updatedInVersion, appVersion)) {
    return { badge: "updated", version: updatedInVersion };
  }
  return null;
}

type AcknowledgedVersions = Readonly<Record<string, string>>;

let acknowledgedCache: AcknowledgedVersions | null = null;
const listeners = new Set<() => void>();

function readAcknowledged(): AcknowledgedVersions {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

// Stable snapshot for useSyncExternalStore; replaced wholesale on writes.
export function getAcknowledgedToolVersions(): AcknowledgedVersions {
  if (!acknowledgedCache) acknowledgedCache = readAcknowledged();
  return acknowledgedCache;
}

export function subscribeToolFreshness(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isToolFreshnessAcknowledged(
  acknowledged: AcknowledgedVersions,
  toolId: string,
  version: string,
): boolean {
  const seen = acknowledged[toolId];
  return !!seen && updateService.compareVersions(seen, version) >= 0;
}

// Records that the user has opened the tool at its currently tagged version.
export function acknowledgeToolFreshness(
  toolId: string,
  tool: FreshnessFields,
): void {
  const version = latestTaggedVersion(tool);
  if (!version) return;
  const current = getAcknowledgedToolVersions();
  if (isToolFreshnessAcknowledged(current, toolId, version)) return;
  acknowledgedCache = { ...current, [toolId]: version };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(acknowledgedCache));
  } catch {
    // Storage being unavailable only means the badge reappears next visit.
  }
  listeners.forEach((listener) => listener());
}

// Test hook: drops the in-memory cache so the next read hits localStorage.
export function resetToolFreshnessCache(): void {
  acknowledgedCache = null;
}
