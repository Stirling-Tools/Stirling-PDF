import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useAddAttachmentsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "AddAttachmentsRequest.tooltip.header.title",
        "About Manage Attachments",
      ),
    },
    tips: [
      {
        title: t(
          "AddAttachmentsRequest.tooltip.description.title",
          "What it does",
        ),
        description: t(
          "AddAttachmentsRequest.info",
          "View, add, extract, rename, or delete embedded PDF attachments. Changes are staged cleanly and saved to your document in one pass.",
        ),
      },
    ],
  };
};
