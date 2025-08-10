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
  [SPLIT_MODES.BY_PAGES]: 'split-pages',
  [SPLIT_MODES.BY_SECTIONS]: 'split-pdf-by-sections',
  [SPLIT_MODES.BY_SIZE_OR_COUNT]: 'split-by-size-or-count',
  [SPLIT_MODES.BY_CHAPTERS]: 'split-pdf-by-chapters'
} as const;

export type SplitMode = typeof SPLIT_MODES[keyof typeof SPLIT_MODES];
export type SplitType = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES];