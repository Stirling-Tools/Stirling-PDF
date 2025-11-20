import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRemoveAnnotationsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("removeAnnotations.tooltip.header.title", "About Remove Annotations")
    },
    tips: [
      {
        title: t("removeAnnotations.tooltip.description.title", "What it does"),
        description: t('removeAnnotations.info.description',
          'This tool will remove all annotations (comments, highlights, notes, etc.) from your PDF documents.'
        ),
      }
    ]
  };
};
