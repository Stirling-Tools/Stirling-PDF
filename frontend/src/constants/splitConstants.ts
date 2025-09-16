export const SPLIT_METHODS = {
  BY_PAGES: 'byPages',
  BY_SECTIONS: 'bySections',
  BY_SIZE: 'bySize',
  BY_PAGE_COUNT: 'byPageCount',
  BY_DOC_COUNT: 'byDocCount',
  BY_CHAPTERS: 'byChapters',
  BY_PAGE_DIVIDER: 'byPageDivider'
} as const;


export const ENDPOINTS = {
  [SPLIT_METHODS.BY_PAGES]: 'split-pages',
  [SPLIT_METHODS.BY_SECTIONS]: 'split-pdf-by-sections',
  [SPLIT_METHODS.BY_SIZE]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_PAGE_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_DOC_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_CHAPTERS]: 'split-pdf-by-chapters',
  [SPLIT_METHODS.BY_PAGE_DIVIDER]: 'auto-split-pdf'
} as const;

export type SplitMethod = typeof SPLIT_METHODS[keyof typeof SPLIT_METHODS];
export const isSplitMethod = (value: string | null): value is SplitMethod => {
  return Object.values(SPLIT_METHODS).includes(value as SplitMethod);
}

export interface MethodOption {
  method: SplitMethod;
  icon: string;
  prefixKey: string;
  nameKey: string;
  descKey: string;
  tooltipKey: string;
}

export const METHOD_OPTIONS: MethodOption[] = [
  {
    method: SPLIT_METHODS.BY_PAGES,
    icon: "format-list-numbered-rounded",
    prefixKey: "split.methods.prefix.splitAt",
    nameKey: "split.methods.byPages.name",
    descKey: "split.methods.byPages.desc",
    tooltipKey: "split.methods.byPages.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_CHAPTERS,
    icon: "bookmark-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byChapters.name",
    descKey: "split.methods.byChapters.desc",
    tooltipKey: "split.methods.byChapters.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_SECTIONS,
    icon: "grid-on-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySections.name",
    descKey: "split.methods.bySections.desc",
    tooltipKey: "split.methods.bySections.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_SIZE,
    icon: "storage-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.bySize.name",
    descKey: "split.methods.bySize.desc",
    tooltipKey: "split.methods.bySize.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_PAGE_COUNT,
    icon: "numbers-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageCount.name",
    descKey: "split.methods.byPageCount.desc",
    tooltipKey: "split.methods.byPageCount.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_DOC_COUNT,
    icon: "content-copy-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byDocCount.name",
    descKey: "split.methods.byDocCount.desc",
    tooltipKey: "split.methods.byDocCount.tooltip"
  },
  {
    method: SPLIT_METHODS.BY_PAGE_DIVIDER,
    icon: "auto-awesome-rounded",
    prefixKey: "split.methods.prefix.splitBy",
    nameKey: "split.methods.byPageDivider.name",
    descKey: "split.methods.byPageDivider.desc",
    tooltipKey: "split.methods.byPageDivider.tooltip"
  }
];


