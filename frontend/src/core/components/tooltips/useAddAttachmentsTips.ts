import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAddAttachmentsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("AddAttachmentsRequest.tooltip.header.title", "About Add Attachments")
    },
    tips: [
      {
        title: t("AddAttachmentsRequest.tooltip.description.title", "What it does"),
        description: t("AddAttachmentsRequest.info", "Select files to attach to your PDF. These files will be embedded and accessible through the PDF's attachment panel."),
      }
    ]
  };
};
