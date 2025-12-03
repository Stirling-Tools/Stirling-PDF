import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAdvancedOCRTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("ocr.tooltip.advanced.header.title", "Advanced OCR Processing"),
    },
    tips: [
      {
        title: t("ocr.tooltip.advanced.compatibility.title", "Compatibility Mode"),
        description: t("ocr.tooltip.advanced.compatibility.text", "Uses OCR 'sandwich PDF' mode: results in larger files, but more reliable with certain languages and older PDF software. By default we use hOCR for smaller, modern PDFs.")
      },
      {
        title: t("ocr.tooltip.advanced.sidecar.title", "Create Text File"),
        description: t("ocr.tooltip.advanced.sidecar.text", "Generates a separate .txt file alongside the PDF containing all extracted text content for easy access and processing.")
      },
      {
        title: t("ocr.tooltip.advanced.deskew.title", "Deskew Pages"),
        description: t("ocr.tooltip.advanced.deskew.text", "Automatically corrects skewed or tilted pages to improve OCR accuracy. Useful for scanned documents that weren't perfectly aligned.")
      },
      {
        title: t("ocr.tooltip.advanced.clean.title", "Clean Input File"),
        description: t("ocr.tooltip.advanced.clean.text", "Preprocesses the input by removing noise, enhancing contrast, and optimising the image for better OCR recognition before processing.")
      },
      {
        title: t("ocr.tooltip.advanced.cleanFinal.title", "Clean Final Output"),
        description: t("ocr.tooltip.advanced.cleanFinal.text", "Post-processes the final PDF by removing OCR artefacts and optimising the text layer for better readability and smaller file size.")
      },
      {
        title: t("ocr.tooltip.advanced.invalidateDigitalSignatures.title", "Invalidate digital signatures"),
        description: t("ocr.tooltip.advanced.invalidateDigitalSignatures.text", "Warning: Enabling this option will invalidate any digital signatures in the PDF. The document will no longer be legally valid as a signed document.")
      }
    ]
  };
};
