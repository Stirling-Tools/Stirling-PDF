export const SPLIT_METHODS = {
  BY_PAGES: 'byPages',
  BY_SECTIONS: 'bySections',
  BY_SIZE: 'bySize',
  BY_PAGE_COUNT: 'byPageCount',
  BY_DOC_COUNT: 'byDocCount',
  BY_CHAPTERS: 'byChapters'
} as const;


export const ENDPOINTS = {
  [SPLIT_METHODS.BY_PAGES]: 'split-pages',
  [SPLIT_METHODS.BY_SECTIONS]: 'split-pdf-by-sections',
  [SPLIT_METHODS.BY_SIZE]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_PAGE_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_DOC_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_CHAPTERS]: 'split-pdf-by-chapters'
} as const;

export type SplitMethod = typeof SPLIT_METHODS[keyof typeof SPLIT_METHODS];
export const isSplitMethod = (value: string | null): value is SplitMethod => {
  return Object.values(SPLIT_METHODS).includes(value as SplitMethod);
}


