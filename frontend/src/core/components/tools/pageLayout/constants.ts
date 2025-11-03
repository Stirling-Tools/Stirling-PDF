import { TFunction } from 'i18next';

export type PagesPerSheetOption = {
  value: number;
  label: string;
  description: string;
};

export const getPagesPerSheetOptions = (t: TFunction): PagesPerSheetOption[] => [
  {
    value: 2,
    label: '2',
    description: t('pageLayout.desc.2', 'Place 2 pages side-by-side on a single sheet.')
  },
  {
    value: 3,
    label: '3',
    description: t('pageLayout.desc.3', 'Place 3 pages on a single sheet in a single row.')
  },
  {
    value: 4,
    label: '4',
    description: t('pageLayout.desc.4', 'Place 4 pages on a single sheet (2 × 2 grid).')
  },
  {
    value: 9,
    label: '9',
    description: t('pageLayout.desc.9', 'Place 9 pages on a single sheet (3 × 3 grid).')
  },
  {
    value: 16,
    label: '16',
    description: t('pageLayout.desc.16', 'Place 16 pages on a single sheet (4 × 4 grid).')
  },
];


