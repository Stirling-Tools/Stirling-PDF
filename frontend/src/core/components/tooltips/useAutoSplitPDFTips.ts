import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAutoSplitPDFTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("autoSplitPDF.help.title", "QR Code Auto-Split Help")
    },
    tips: [
      {
        title: t("autoSplitPDF.help.overview", "Overview"),
        description: t("autoSplitPDF.help.overview", "This tool automatically splits scanned PDFs using special QR code divider pages. Perfect for batch scanning multiple documents.")
      },
      {
        title: t("autoSplitPDF.help.howItWorks", "How It Works"),
        description: "",
        bullets: [
          t("autoSplitPDF.help.step1", "1. Download and print the QR code divider page (black & white is fine)"),
          t("autoSplitPDF.help.step2", "2. Place divider pages between your documents"),
          t("autoSplitPDF.help.step3", "3. Scan all documents in one batch (dividers included)"),
          t("autoSplitPDF.help.step4", "4. Upload to Stirling-PDF - documents are automatically separated and dividers removed")
        ]
      },
      {
        title: t("autoSplitPDF.help.duplexMode", "Duplex Mode (Double-Sided Scanning)"),
        description: t("autoSplitPDF.help.duplexDesc", "Enable 'Duplex Mode' when scanning double-sided documents. This automatically skips the back sides of divider pages, preventing blank pages in your output."),
        bullets: [
          t("autoSplitPDF.help.duplexExample", "Example: With duplex ON, if you scan a divider followed by a 2-page document, the tool knows the divider's back is blank and skips it.")
        ]
      },
      {
        title: t("autoSplitPDF.help.qrCodes", "Valid QR Codes"),
        description: t("autoSplitPDF.help.qrDesc", "Only QR codes from Stirling-PDF divider pages work. These contain specific URLs: github.com/Stirling-Tools/Stirling-PDF, github.com/Frooodle/Stirling-PDF, or stirlingpdf.com")
      },
      {
        title: t("autoSplitPDF.help.useCases", "Best Use Cases"),
        description: "",
        bullets: [
          t("autoSplitPDF.help.useCase1", "Batch scanning multiple contracts, forms, or reports"),
          t("autoSplitPDF.help.useCase2", "Digitizing physical file folders"),
          t("autoSplitPDF.help.useCase3", "Scanning stacks of invoices or receipts"),
          t("autoSplitPDF.help.useCase4", "Processing mail or paperwork in bulk")
        ]
      },
      {
        title: t("autoSplitPDF.help.tips", "Tips"),
        description: "",
        bullets: [
          t("autoSplitPDF.help.tip1", "Print dividers once, reuse them for all your scanning sessions"),
          t("autoSplitPDF.help.tip2", "Dividers work in black & white - no need for color printing"),
          t("autoSplitPDF.help.tip3", "Make sure QR codes are clearly visible (not crumpled or dirty)"),
          t("autoSplitPDF.help.tip4", "For best results, use the same paper weight for dividers as your documents")
        ]
      }
    ]
  };
};
