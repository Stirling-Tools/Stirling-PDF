import i18n from "i18next";
import type { TFunction } from "i18next";
import { isProcessorEnabled } from "@app/services/processorEnabled";

/**
 * Content-level settings search: matches a query against every translation
 * string a settings section renders, so a term that appears anywhere on a
 * settings page ("SMTP", "OCR", a field label…) finds that section without a
 * curated keyword.
 *
 * Component-free (translation subtrees only) so the always-mounted super
 * search can use it without pulling the lazy settings modal into the main
 * bundle.
 */

/**
 * Translation subtrees whose strings appear on each settings section, for the
 * sections where the nav key doesn't map 1:1 onto a toml prefix. Keys missing
 * here fall back to the inferred `settings.<key>` / `admin.settings.<key>`
 * prefix.
 */
const SECTION_TRANSLATION_PREFIXES: Partial<Record<string, string[]>> = {
  general: ["settings.general"],
  hotkeys: ["settings.hotkeys"],
  account: ["account"],
  people: ["settings.workspace"],
  teams: ["settings.workspace", "settings.team"],
  "api-keys": ["settings.developer"],
  connectionMode: ["settings.connection"],
  planBilling: ["settings.planBilling"],
  adminGeneral: ["admin.settings.general"],
  adminFeatures: ["admin.settings.features"],
  adminEndpoints: ["admin.settings.endpoints"],
  adminDatabase: ["admin.settings.database"],
  adminAdvanced: ["admin.settings.advanced"],
  adminFolderAccess: ["admin.settings.folderAccess"],
  // The four AI tabs all render slices of the one admin.settings.ai subtree.
  adminAiGeneral: ["admin.settings.ai"],
  adminAiModels: ["admin.settings.ai"],
  adminAiDocuments: ["admin.settings.ai"],
  adminAiLimits: ["admin.settings.ai"],
  adminSecurity: ["admin.settings.security"],
  adminMcp: ["admin.settings.mcp"],
  adminConnections: [
    "admin.settings.connections",
    "admin.settings.mail",
    "admin.settings.security",
    "admin.settings.telegram",
    "admin.settings.premium",
    "admin.settings.general",
    "settings.securityAuth",
    "settings.connection",
  ],
  adminPlan: [
    "settings.planBilling",
    "admin.settings.premium",
    "settings.licensingAnalytics",
  ],
  adminAudit: ["settings.licensingAnalytics"],
  adminUsage: ["settings.licensingAnalytics"],
  adminLegal: ["admin.settings.legal"],
  adminPrivacy: ["admin.settings.privacy"],
};

export const getTranslationPrefixesForNavKey = (key: string): string[] => {
  const explicitPrefixes = SECTION_TRANSLATION_PREFIXES[key] ?? [];

  const inferredPrefixes: string[] = [];

  if (key.startsWith("admin")) {
    const adminSuffix = key.replace(/^admin/, "");
    const normalizedAdminSuffix =
      adminSuffix.charAt(0).toLowerCase() + adminSuffix.slice(1);
    inferredPrefixes.push(`admin.settings.${normalizedAdminSuffix}`);
  } else {
    inferredPrefixes.push(`settings.${key}`);
  }

  return Array.from(new Set([...explicitPrefixes, ...inferredPrefixes]));
};

/**
 * Sub-keys, relative to a section's translation prefix, whose controls only
 * render when the server runs the Processor. Matching whole subtrees means a
 * hidden control's copy is still searchable, so drop these when it is off.
 */
const PROCESSOR_ONLY_SUBTREES: Record<string, string[]> = {
  "settings.general": ["loginLanding"],
  // The group blurb names pipeline processing too; the External Tool Paths
  // labels still make this section findable without it.
  "admin.settings.general": ["customPaths.pipeline", "customPaths.description"],
  // Sibling of the two nav labels the Connections section really uses.
  "settings.securityAuth": ["telegram"],
};

/**
 * Whole prefixes to skip with the Processor off. The Telegram bot round-trips
 * through the pipeline folders, so its provider card is dropped from
 * Connections entirely, not just trimmed.
 */
const PROCESSOR_ONLY_PREFIXES = new Set(["admin.settings.telegram"]);

/** Returns the subtree with the given dotted paths removed (non-mutating). */
const omitPaths = (value: unknown, paths: string[]): unknown => {
  if (!value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    if (!(head in copy)) continue;
    copy[head] = rest.length
      ? omitPaths(copy[head], [rest.join(".")])
      : undefined;
  }
  return copy;
};

export const flattenTranslationStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenTranslationStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      flattenTranslationStrings,
    );
  }

  return [];
};

/** Trims a matched string to a short snippet centred on the query hit. */
export const buildMatchSnippet = (text: string, query: string): string => {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return text;
  }

  // Lowercasing can change string length in some locales (Turkish İ, ß), so
  // indices computed on the copy only align with the original when the
  // lengths match; otherwise snippet the copy itself.
  const source = normalizedText.length === text.length ? text : normalizedText;

  const maxLength = 84;
  const contextPadding = 28;
  const start = Math.max(0, matchIndex - contextPadding);
  const end = Math.min(
    source.length,
    matchIndex + query.length + contextPadding,
  );
  const snippet = source.slice(start, end);

  if (snippet.length <= maxLength) {
    return `${start > 0 ? "…" : ""}${snippet}${end < source.length ? "…" : ""}`;
  }

  return `${start > 0 ? "…" : ""}${snippet.slice(0, maxLength)}${end < source.length ? "…" : ""}`;
};

// Flattening every subtree on each keystroke would be wasteful; sections'
// content is static per language, so cache it and drop the cache on switch.
const contentCache = new Map<string, string[]>();
let contentCacheLanguage: string | undefined;

// Locale files load over HTTP after boot, so content computed before the
// bundle resolves is empty — without this, an early query would cache empty
// content for the whole session. Cleared whenever a resource bundle lands.
i18n.on("loaded", () => contentCache.clear());

export function getSettingsSectionContent(key: string, t: TFunction): string[] {
  if (contentCacheLanguage !== i18n.language) {
    contentCache.clear();
    contentCacheLanguage = i18n.language;
  }
  // Part of the cache key: app-config can land after a first query cached the
  // Processor-on content, and that entry must not outlive the answer.
  const processorOn = isProcessorEnabled();
  const cacheKey = `${key}:${processorOn}`;
  const cached = contentCache.get(cacheKey);
  if (cached) return cached;

  const content = getTranslationPrefixesForNavKey(key).flatMap((prefix) => {
    if (!processorOn && PROCESSOR_ONLY_PREFIXES.has(prefix)) return [];
    const subtree = t(prefix, { returnObjects: true, defaultValue: {} });
    const omitted = PROCESSOR_ONLY_SUBTREES[prefix];
    return flattenTranslationStrings(
      !processorOn && omitted ? omitPaths(subtree, omitted) : subtree,
    );
  });
  contentCache.set(cacheKey, content);
  return content;
}

/**
 * First content string of the section containing the query
 * (case-insensitive), or null. Substring only — fuzzy matching across whole
 * paragraphs of copy produces junk hits.
 */
export function findSettingsContentMatch(
  key: string,
  query: string,
  t: TFunction,
): string | null {
  const normalizedQuery = query.toLocaleLowerCase();
  return (
    getSettingsSectionContent(key, t).find((text) =>
      text.toLocaleLowerCase().includes(normalizedQuery),
    ) ?? null
  );
}
