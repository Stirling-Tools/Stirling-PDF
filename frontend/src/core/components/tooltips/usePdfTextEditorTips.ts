import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const usePdfTextEditorTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('pdfTextEditor.tooltip.header.title', 'Preview Limitations'),
    },
    tips: [
      {
        title: t('pdfTextEditor.tooltip.textFocus.title', 'Text and Image Focus'),
        description: t(
          'pdfTextEditor.tooltip.textFocus.text',
          'This workspace focuses on editing text and repositioning embedded images. Complex page artwork, form widgets, and layered graphics are preserved for export but are not fully editable here.'
        ),
      },
      {
        title: t('pdfTextEditor.tooltip.previewVariance.title', 'Preview Variance'),
        description: t(
          'pdfTextEditor.tooltip.previewVariance.text',
          'Some visuals (such as table borders, shapes, or annotation appearances) may not display exactly in the preview. The exported PDF keeps the original drawing commands whenever possible.'
        ),
      },
      {
        title: t('pdfTextEditor.tooltip.alpha.title', 'Alpha Viewer'),
        description: t(
          'pdfTextEditor.tooltip.alpha.text',
          'This alpha viewer is still evolving—certain fonts, colours, transparency effects, and layout details may shift slightly. Please double-check the generated PDF before sharing.'
        ),
      },
    ],
  };
};

