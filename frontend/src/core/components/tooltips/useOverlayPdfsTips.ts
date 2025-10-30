import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useOverlayPdfsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('overlay-pdfs.tooltip.header.title', 'Overlay PDFs Overview')
    },
    tips: [
      {
        title: t('overlay-pdfs.tooltip.description.title', 'Description'),
        description: t(
          'overlay-pdfs.tooltip.description.text',
          'Combine a original PDF with one or more overlay PDFs. Overlays can be applied page-by-page in different modes and placed in the foreground or background.'
        )
      },
      {
        title: t('overlay-pdfs.tooltip.mode.title', 'Overlay Mode'),
        description: t(
          'overlay-pdfs.tooltip.mode.text',
          'Choose how to distribute overlay pages across the original PDF pages.'
        ),
        bullets: [
          t('overlay-pdfs.tooltip.mode.sequential', 'Sequential Overlay: Use pages from the first overlay PDF until it ends, then move to the next.'),
          t('overlay-pdfs.tooltip.mode.interleaved', 'Interleaved Overlay: Take one page from each overlay in turn.'),
          t('overlay-pdfs.tooltip.mode.fixedRepeat', 'Fixed Repeat Overlay: Take a set number of pages from each overlay before moving to the next. Use Counts to set the numbers.')
        ]
      },
      {
        title: t('overlay-pdfs.tooltip.position.title', 'Overlay Position'),
        description: t(
          'overlay-pdfs.tooltip.position.text',
          'Foreground places the overlay on top of the page. Background places it behind.'
        )
      },
      {
        title: t('overlay-pdfs.tooltip.overlayFiles.title', 'Overlay Files'),
        description: t(
          'overlay-pdfs.tooltip.overlayFiles.text',
          'Select one or more PDFs to overlay on the original. The order of these files affects how pages are applied in Sequential and Fixed Repeat modes.'
        )
      },
      {
        title: t('overlay-pdfs.tooltip.counts.title', 'Counts (Fixed Repeat only)'),
        description: t(
          'overlay-pdfs.tooltip.counts.text',
          'Provide a positive number for each overlay file showing how many pages to take before moving to the next. Required when mode is Fixed Repeat.'
        )
      }
    ]
  };
};


