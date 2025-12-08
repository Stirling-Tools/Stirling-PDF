import { TFunction } from 'i18next';

export const getReorganizePagesModeData = (t: TFunction) => [
  { 
    value: '', 
    label: t('pdfOrganiser.mode.1', 'Custom Page Order'),
    description: t('pdfOrganiser.mode.desc.CUSTOM', 'Use a custom sequence of page numbers or expressions to define a new order.')
  },
  { 
    value: 'REVERSE_ORDER', 
    label: t('pdfOrganiser.mode.2', 'Reverse Order'),
    description: t('pdfOrganiser.mode.desc.REVERSE_ORDER', 'Flip the document so the last page becomes first and so on.')
  },
  { 
    value: 'DUPLEX_SORT', 
    label: t('pdfOrganiser.mode.3', 'Duplex Sort'),
    description: t('pdfOrganiser.mode.desc.DUPLEX_SORT', 'Interleave fronts then backs as if a duplex scanner scanned all fronts, then all backs (1, n, 2, n-1, …).')
  },
  { 
    value: 'BOOKLET_SORT', 
    label: t('pdfOrganiser.mode.4', 'Booklet Sort'),
    description: t('pdfOrganiser.mode.desc.BOOKLET_SORT', 'Arrange pages for booklet printing (last, first, second, second last, …).')
  },
  { 
    value: 'SIDE_STITCH_BOOKLET_SORT', 
    label: t('pdfOrganiser.mode.5', 'Side Stitch Booklet Sort'),
    description: t('pdfOrganiser.mode.desc.SIDE_STITCH_BOOKLET_SORT', 'Arrange pages for side‑stitch booklet printing (optimized for binding on the side).')
  },
  { 
    value: 'ODD_EVEN_SPLIT', 
    label: t('pdfOrganiser.mode.6', 'Odd-Even Split'),
    description: t('pdfOrganiser.mode.desc.ODD_EVEN_SPLIT', 'Split the document into two outputs: all odd pages and all even pages.')
  },
  { 
    value: 'ODD_EVEN_MERGE', 
    label: t('pdfOrganiser.mode.10', 'Odd-Even Merge'),
    description: t('pdfOrganiser.mode.desc.ODD_EVEN_MERGE', 'Merge two PDFs by alternating pages: odd from the first, even from the second.')
  },
  { 
    value: 'DUPLICATE', 
    label: t('pdfOrganiser.mode.11', 'Duplicate all pages'),
    description: t('pdfOrganiser.mode.desc.DUPLICATE', 'Duplicate each page according to the custom order count (e.g., 4 duplicates each page 4×).')
  },
  { 
    value: 'REMOVE_FIRST', 
    label: t('pdfOrganiser.mode.7', 'Remove First'),
    description: t('pdfOrganiser.mode.desc.REMOVE_FIRST', 'Remove the first page from the document.')
  },
  { 
    value: 'REMOVE_LAST', 
    label: t('pdfOrganiser.mode.8', 'Remove Last'),
    description: t('pdfOrganiser.mode.desc.REMOVE_LAST', 'Remove the last page from the document.')
  },
  { 
    value: 'REMOVE_FIRST_AND_LAST', 
    label: t('pdfOrganiser.mode.9', 'Remove First and Last'),
    description: t('pdfOrganiser.mode.desc.REMOVE_FIRST_AND_LAST', 'Remove both the first and last pages from the document.')
  },
];
