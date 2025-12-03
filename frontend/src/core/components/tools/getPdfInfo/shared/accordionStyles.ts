import type { AccordionStylesNames } from '@mantine/core';
import type { CSSProperties } from 'react';

type AccordionStyles = Partial<Record<AccordionStylesNames, CSSProperties>>;

export const pdfInfoAccordionStyles: AccordionStyles = {
  item: {
    backgroundColor: 'var(--accordion-item-bg)',
  },
  control: {
    backgroundColor: 'transparent',
  },
};

