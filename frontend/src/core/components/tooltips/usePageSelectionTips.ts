import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const usePageSelectionTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('bulkSelection.header.title', 'Page Selection Guide'),
    },
    tips: [
      {
        title: t('bulkSelection.syntax.title', 'Syntax Basics'),
        description: t('bulkSelection.syntax.text', 'Use numbers, ranges, keywords, and progressions (n starts at 0). Parentheses are supported.'),
        bullets: [
          t('bulkSelection.syntax.bullets.numbers', 'Numbers/ranges: 5, 10-20'),
          t('bulkSelection.syntax.bullets.keywords', 'Keywords: odd, even'),
          t('bulkSelection.syntax.bullets.progressions', 'Progressions: 3n, 4n+1'),
        ]
      },
      {
        title: t('bulkSelection.operators.title', 'Operators'),
        description: t('bulkSelection.operators.text', 'AND has higher precedence than comma. NOT applies within the document range.'),
        bullets: [
          t('bulkSelection.operators.and', 'AND: & or "and" — require both conditions (e.g., 1-50 & even)'),
          t('bulkSelection.operators.comma', 'Comma: , or | — combine selections (e.g., 1-10, 20)'),
          t('bulkSelection.operators.not', 'NOT: ! or "not" — exclude pages (e.g., 3n & not 30)'),
        ]
      },
      {
        title: t('bulkSelection.examples.title', 'Examples'),
        bullets: [
          `${t('bulkSelection.examples.first50', 'First 50')}: 1-50`,
          `${t('bulkSelection.examples.last50', 'Last 50')}: 451-500`,
          `${t('bulkSelection.examples.every3rd', 'Every 3rd')}: 3n`,
          `${t('bulkSelection.examples.oddWithinExcluding', 'Odd within 1-20 excluding 5-7')}: 1-20 & odd & !5-7`,
          `${t('bulkSelection.examples.combineSets', 'Combine sets')}: 1-50, 451-500`,
        ]
      }
    ]
  };
};


