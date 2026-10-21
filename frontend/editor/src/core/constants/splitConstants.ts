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

export type SplitIntentId = "pages" | "parts" | "boundaries" | "pieces";

/**
 * One goal the user can have, with the methods that serve it. The picker shows
 * goals rather than techniques; the goal's methods become a variant switch in
 * the settings step.
 */
export interface SplitIntent {
  id: SplitIntentId;
  icon: IconName;
  titleKey: string;
  /** One sentence: what the user gets. Shown under the title on the card. */
  descriptionKey: string;
  /** Methods this goal can be achieved with; the first is the default. */
  methods: SplitMethod[];
  /** Short variant-switch label per method, kept to one word at rail width. */
  variantLabelKeys: Partial<Record<SplitMethod, string>>;
}

export const SPLIT_INTENTS: SplitIntent[] = [
  {
    id: "pages",
    icon: "scissors",
    titleKey: "split.intent.pages.title",
    descriptionKey: "split.intent.pages.description",
    methods: [SPLIT_METHODS.BY_PAGES],
    variantLabelKeys: {
      [SPLIT_METHODS.BY_PAGES]: "split.variant.pages",
    },
  },
  {
    id: "parts",
    icon: "layers",
    titleKey: "split.intent.parts.title",
    descriptionKey: "split.intent.parts.description",
    methods: [
      SPLIT_METHODS.BY_PAGE_COUNT,
      SPLIT_METHODS.BY_DOC_COUNT,
      SPLIT_METHODS.BY_SIZE,
    ],
    variantLabelKeys: {
      [SPLIT_METHODS.BY_PAGE_COUNT]: "split.variant.pageCount",
      [SPLIT_METHODS.BY_DOC_COUNT]: "split.variant.docCount",
      [SPLIT_METHODS.BY_SIZE]: "split.variant.size",
    },
  },
  {
    id: "boundaries",
    icon: "bookmark",
    titleKey: "split.intent.boundaries.title",
    descriptionKey: "split.intent.boundaries.description",
    methods: [SPLIT_METHODS.BY_CHAPTERS, SPLIT_METHODS.BY_PAGE_DIVIDER],
    variantLabelKeys: {
      [SPLIT_METHODS.BY_CHAPTERS]: "split.variant.chapters",
      [SPLIT_METHODS.BY_PAGE_DIVIDER]: "split.variant.divider",
    },
  },
  {
    id: "pieces",
    icon: "layout-grid",
    titleKey: "split.intent.pieces.title",
    descriptionKey: "split.intent.pieces.description",
    methods: [SPLIT_METHODS.BY_SECTIONS, SPLIT_METHODS.BY_POSTER],
    variantLabelKeys: {
      [SPLIT_METHODS.BY_SECTIONS]: "split.variant.sections",
      [SPLIT_METHODS.BY_POSTER]: "split.variant.poster",
    },
  },
];

export function intentForMethod(
  method: SplitMethod | null,
): SplitIntent | null {
  if (!method) return null;
  return (
    SPLIT_INTENTS.find((intent) => intent.methods.includes(method)) ?? null
  );
}
