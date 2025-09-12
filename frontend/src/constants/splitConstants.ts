export const SPLIT_METHODS = {
  BY_PAGES: 'byPages',
  BY_SECTIONS: 'bySections',
  BY_SIZE: 'bySize',
  BY_PAGE_COUNT: 'byPageCount',
  BY_DOC_COUNT: 'byDocCount',
  BY_CHAPTERS: 'byChapters'
} as const;

// Legacy constants for backward compatibility
export const SPLIT_MODES = {
  BY_PAGES: 'byPages',
  BY_SECTIONS: 'bySections',
  BY_SIZE_OR_COUNT: 'bySizeOrCount',
  BY_CHAPTERS: 'byChapters'
} as const;

export const SPLIT_TYPES = {
  SIZE: 'size',
  PAGES: 'pages',
  DOCS: 'docs'
} as const;

export const ENDPOINTS = {
  [SPLIT_METHODS.BY_PAGES]: 'split-pages',
  [SPLIT_METHODS.BY_SECTIONS]: 'split-pdf-by-sections',
  [SPLIT_METHODS.BY_SIZE]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_PAGE_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_DOC_COUNT]: 'split-by-size-or-count',
  [SPLIT_METHODS.BY_CHAPTERS]: 'split-pdf-by-chapters'
} as const;

export const METHOD_TO_SPLIT_TYPE = {
  [SPLIT_METHODS.BY_SIZE]: SPLIT_TYPES.SIZE,
  [SPLIT_METHODS.BY_PAGE_COUNT]: SPLIT_TYPES.PAGES,
  [SPLIT_METHODS.BY_DOC_COUNT]: SPLIT_TYPES.DOCS
} as const;

export type SplitMethod = typeof SPLIT_METHODS[keyof typeof SPLIT_METHODS];
export type SplitMode = typeof SPLIT_MODES[keyof typeof SPLIT_MODES];
export type SplitType = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES];

export const isSplitMethod = (value: string | null): value is SplitMethod => {
  return Object.values(SPLIT_METHODS).includes(value as SplitMethod);
}

export const isSplitMode = (value: string | null): value is SplitMode => {
  return Object.values(SPLIT_MODES).includes(value as SplitMode);
}

export const isSplitType = (value: string | null): value is SplitType => {
  return Object.values(SPLIT_TYPES).includes(value as SplitType);
}
