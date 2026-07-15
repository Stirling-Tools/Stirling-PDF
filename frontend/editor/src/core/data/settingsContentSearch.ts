import i18n from "i18next";
import type { TFunction } from "i18next";

/**
 * Content-level settings search: matches a query against every translation
 * string a settings section renders, so a term that appears anywhere on a
 * settings page ("SMTP", "OCR", a field label…) finds that section without a
 * curated keyword.
 *
 * This is the single source for the technique — the in-modal settings search
 * bar and the global super search both build on it. It is intentionally
 * component-free (translation subtrees only) so the always-mounted super
 * search bar can use it without pulling the lazy settings modal into the main
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

  const maxLength = 84;
  const contextPadding = 28;
  const start = Math.max(0, matchIndex - contextPadding);
  const end = Math.min(text.length, matchIndex + query.length + contextPadding);
  const snippet = text.slice(start, end);

  if (snippet.length <= maxLength) {
    return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
  }

  return `${start > 0 ? "…" : ""}${snippet.slice(0, maxLength)}${end < text.length ? "…" : ""}`;
};

// Flattening every subtree on each keystroke would be wasteful; sections'
// content is static per language, so cache it and drop the cache on switch.
const contentCache = new Map<string, string[]>();
let contentCacheLanguage: string | undefined;

export function getSettingsSectionContent(key: string, t: TFunction): string[] {
  if (contentCacheLanguage !== i18n.language) {
    contentCache.clear();
    contentCacheLanguage = i18n.language;
  }
  const cached = contentCache.get(key);
  if (cached) return cached;

  const content = getTranslationPrefixesForNavKey(key).flatMap((prefix) =>
    flattenTranslationStrings(
      t(prefix, { returnObjects: true, defaultValue: {} }),
    ),
  );
  contentCache.set(key, content);
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
