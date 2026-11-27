import i18n from "i18next";
import type { TFunction } from "i18next";
import { flattenTranslationStrings } from "@editor/data/settingsContentSearch";

/**
 * Mapping from toolId to additional translation section prefixes that contain
 * controls, options, or parameters for that tool.
 */
const EXTRA_TOOL_TRANSLATION_PREFIXES: Partial<Record<string, string[]>> = {
  replaceColor: ["replace-color"],
  split: [
    "split-by-sections",
    "split-by-size-or-count",
    "splitByChapters",
    "autoSplitPDF",
    "autoSizeSplitPDF",
    "home.autoSplitPDF",
    "home.autoSizeSplitPDF",
  ],
  reorganizePages: ["pdfOrganiser", "home.pdfOrganiser"],
  addAttachments: ["attachments", "AddAttachmentsRequest"],
  overlayPdfs: ["overlay-pdfs"],
  scannerImageSplit: ["ScannerImageSplit"],
  autoRename: ["auto-rename"],
  annotate: ["annotation"],
  scalePages: ["adjustPageScale"],
  certSign: ["sign.canvas", "sign.type"],
};

export const getTranslationPrefixesForToolId = (toolId: string): string[] => {
  const prefixes = [
    toolId,
    `home.${toolId}`,
    ...(EXTRA_TOOL_TRANSLATION_PREFIXES[toolId] ?? []),
  ];
  return Array.from(new Set(prefixes));
};

const contentCache = new Map<string, string[]>();
let contentCacheLanguage: string | undefined;

i18n.on("loaded", () => contentCache.clear());

export function getToolContent(toolId: string, t: TFunction): string[] {
  if (contentCacheLanguage !== i18n.language) {
    contentCache.clear();
    contentCacheLanguage = i18n.language;
  }
  const cached = contentCache.get(toolId);
  if (cached) return cached;

  const content = getTranslationPrefixesForToolId(toolId).flatMap((prefix) =>
    flattenTranslationStrings(
      t(prefix, { returnObjects: true, defaultValue: {} }),
    ),
  );
  contentCache.set(toolId, content);
  return content;
}

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/colour/g, "color");
}

export function findToolContentMatch(
  toolId: string,
  query: string,
  t: TFunction,
): string | null {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  const qWords = normalizedQuery.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);

  return (
    getToolContent(toolId, t).find((text) => {
      const normalizedText = normalizeSearchText(text);
      if (normalizedText.includes(normalizedQuery)) return true;
      if (
        qWords.length > 1 &&
        qWords.every((w) => normalizedText.includes(w))
      ) {
        return true;
      }
      return false;
    }) ?? null
  );
}

export const buildToolMatchSnippet = (text: string, query: string): string => {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  let matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    const qWords = normalizedQuery.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
    for (const w of qWords) {
      const idx = normalizedText.indexOf(w);
      if (idx !== -1) {
        matchIndex = idx;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return text;
  }

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
