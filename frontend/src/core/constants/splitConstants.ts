export const SPLIT_METHODS = {
  BY_PAGES: 'byPages',
  BY_SECTIONS: 'bySections',
  BY_SIZE: 'bySize',
  BY_PAGE_COUNT: 'byPageCount',
  BY_DOC_COUNT: 'byDocCount',
  BY_CHAPTERS: 'byChapters',
  BY_PAGE_DIVIDER: 'byPageDivider',
  BY_POSTER: 'byPoster'
} as const;


export const ENDPOINTS = {
  [SPLIT_METHODS.BY_PAGES]: 'split-pages',
  [SPLIT_METHODS.BY_SECTIONS]: 'split-pdf-by-sections',
  [SPLIT_METHODS.BY_SIZE]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_PAGE_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_DOC_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_CHAPTERS]: 'split-pdf-by-chapters',
  [SPLIT_METHODS.BY_PAGE_DIVIDER]: 'auto-split-pdf',
  [SPLIT_METHODS.BY_POSTER]: 'split-for-poster-print'
} as const;

export type SplitMethod = typeof SPLIT_METHODS[keyof typeof SPLIT_METHODS];
export const isSplitMethod = (value: string | null): value is SplitMethod => {
  return Object.values(SPLIT_METHODS).includes(value as SplitMethod);
};

import { CardOption } from '@app/components/shared/CardSelector';

export interface MethodOption extends CardOption<SplitMethod> {
  tooltipKey: string;
}

export const METHOD_OPTIONS: MethodOption[] = [
  {
    value: SPLIT_METHODS.BY_PAGES,
    prefixKey: "split.methods.prefix.splitAt",
    nameKey: "split.methods.byPages.name",
    tooltipKey: "split.methods.byPages.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_CHAPTERS,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byChapters.name",
    tooltipKey: "split.methods.byChapters.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_SECTIONS,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySections.name",
    tooltipKey: "split.methods.bySections.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_SIZE,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySize.name",
    tooltipKey: "split.methods.bySize.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_PAGE_COUNT,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageCount.name",
    tooltipKey: "split.methods.byPageCount.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_DOC_COUNT,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byDocCount.name",
    tooltipKey: "split.methods.byDocCount.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_PAGE_DIVIDER,
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageDivider.name",
    tooltipKey: "split.methods.byPageDivider.tooltip"
  },
  {
    value: SPLIT_METHODS.BY_POSTER,
    prefixKey: "split.methods.prefix.splitInto",
    nameKey: "split.methods.byPoster.name",
    tooltipKey: "split.methods.byPoster.tooltip"
  }
];


