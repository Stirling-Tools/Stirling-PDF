import type { IconName } from "@app/ui/Icon";

export const SPLIT_METHODS = {
  BY_PAGES: "byPages",
  BY_SECTIONS: "bySections",
  BY_SIZE: "bySize",
  BY_PAGE_COUNT: "byPageCount",
  BY_DOC_COUNT: "byDocCount",
  BY_CHAPTERS: "byChapters",
  BY_PAGE_DIVIDER: "byPageDivider",
  BY_POSTER: "byPoster",
} as const;

export const ENDPOINTS = {
  [SPLIT_METHODS.BY_PAGES]: "split-pages",
  [SPLIT_METHODS.BY_SECTIONS]: "split-pdf-by-sections",
  [SPLIT_METHODS.BY_SIZE]: "split-by-size-or-count",
  [SPLIT_METHODS.BY_PAGE_COUNT]: "split-by-size-or-count",
  [SPLIT_METHODS.BY_DOC_COUNT]: "split-by-size-or-count",
  [SPLIT_METHODS.BY_CHAPTERS]: "split-pdf-by-chapters",
  [SPLIT_METHODS.BY_PAGE_DIVIDER]: "auto-split-pdf",
  [SPLIT_METHODS.BY_POSTER]: "split-for-poster-print",
} as const;

export type SplitMethod = (typeof SPLIT_METHODS)[keyof typeof SPLIT_METHODS];

import { CardOption } from "@app/components/shared/CardSelector";

export interface MethodOption extends CardOption<SplitMethod> {
  tooltipKey: string;
}

/** Flat registry of every method, kept for the automation builder's select. */
export const METHOD_OPTIONS: MethodOption[] = [
  {
    value: SPLIT_METHODS.BY_PAGES,
    prefixKey: "split.methods.prefix.splitAt",
    nameKey: "split.methods.byPages.name",
    tooltipKey: "split.methods.byPages.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_CHAPTERS,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byChapters.name",
    tooltipKey: "split.methods.byChapters.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_SECTIONS,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySections.name",
    tooltipKey: "split.methods.bySections.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_SIZE,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySize.name",
    tooltipKey: "split.methods.bySize.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_PAGE_COUNT,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageCount.name",
    tooltipKey: "split.methods.byPageCount.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_DOC_COUNT,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byDocCount.name",
    tooltipKey: "split.methods.byDocCount.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_PAGE_DIVIDER,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageDivider.name",
    tooltipKey: "split.methods.byPageDivider.tooltip",
  },
  {
    value: SPLIT_METHODS.BY_POSTER,
    prefixKey: "split.methods.prefix.splitInto",
    nameKey: "split.methods.byPoster.name",
    tooltipKey: "split.methods.byPoster.tooltip",
  },
];

/**
 * The choices the split screen shows. Three cover the common jobs; the rest
 * are one disclosure away rather than competing for attention on arrival.
 */
export interface SplitChoice {
  method: SplitMethod;
  icon: IconName;
  labelKey: string;
  /** One line: what the user gets, not how it works. */
  descriptionKey: string;
}

export const PRIMARY_SPLIT_CHOICES: SplitChoice[] = [
  {
    method: SPLIT_METHODS.BY_DOC_COUNT,
    icon: "columns-2",
    labelKey: "split.choice.equalParts",
    descriptionKey: "split.choice.equalPartsHint",
  },
  {
    method: SPLIT_METHODS.BY_PAGES,
    icon: "scissors",
    labelKey: "split.choice.chosenPages",
    descriptionKey: "split.choice.chosenPagesHint",
  },
  {
    method: SPLIT_METHODS.BY_CHAPTERS,
    icon: "bookmark",
    labelKey: "split.choice.bookmarks",
    descriptionKey: "split.choice.bookmarksHint",
  },
];

export const MORE_SPLIT_CHOICES: SplitChoice[] = [
  {
    method: SPLIT_METHODS.BY_PAGE_COUNT,
    icon: "files",
    labelKey: "split.choice.pagesPerFile",
    descriptionKey: "split.choice.pagesPerFileHint",
  },
  {
    method: SPLIT_METHODS.BY_SIZE,
    icon: "gauge",
    labelKey: "split.choice.maxSize",
    descriptionKey: "split.choice.maxSizeHint",
  },
  {
    method: SPLIT_METHODS.BY_PAGE_DIVIDER,
    icon: "scan-line",
    labelKey: "split.choice.dividers",
    descriptionKey: "split.choice.dividersHint",
  },
];

export const ALL_SPLIT_CHOICES = [
  ...PRIMARY_SPLIT_CHOICES,
  ...MORE_SPLIT_CHOICES,
];

export function choiceForMethod(
  method: SplitMethod | null,
): SplitChoice | null {
  if (!method) return null;
  return ALL_SPLIT_CHOICES.find((choice) => choice.method === method) ?? null;
}
