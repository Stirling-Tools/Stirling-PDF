import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useReorganizePagesTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('reorganizePages.tooltip.header.title', 'Page Reorganization Settings')
    },
    tips: [
      {
        title: t('reorganizePages.tooltip.description.title', 'How Page Reorganization Works'),
        description: t('reorganizePages.tooltip.description.text', 'Rearrange, duplicate, or remove pages from your PDF using flexible page selection and organization modes.')
      },
      {
        title: t('reorganizePages.tooltip.modes.title', 'Organization Modes'),
        description: t('reorganizePages.tooltip.modes.text', 'Choose how to reorganize your pages:'),
        bullets: [
          t('reorganizePages.tooltip.modes.bullet1', 'Custom Order: Specify exact page sequence'),
          t('reorganizePages.tooltip.modes.bullet2', 'Duplicate Pages: Copy pages multiple times'),
          t('reorganizePages.tooltip.modes.bullet3', 'Reverse Order: Flip page order completely'),
          t('reorganizePages.tooltip.modes.bullet4', 'Remove Pages: Delete specific pages')
        ]
      },
      {
        title: t('reorganizePages.tooltip.pageSelection.title', 'Page Selection'),
        description: t('reorganizePages.tooltip.pageSelection.text', 'Use page numbers, ranges, or formulas to specify which pages to include in your reorganized PDF.')
      }
    ]
  };
};