import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useRedactModeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.tooltip.mode.header.title", "Redaction Method"),
    },
    tips: [
      {
        title: t("redact.tooltip.mode.automatic.title", "Automatic Redaction"),
        description: t(
          "redact.tooltip.mode.automatic.text",
          "Automatically finds and redacts specified text throughout the document. Perfect for removing consistent sensitive information like names, SSNs, or confidential markers.",
        ),
      },
      {
        title: t("redact.tooltip.mode.manual.title", "Manual Redaction"),
        description: t(
          "redact.tooltip.mode.manual.text",
          "Select text or drag rectangles directly in the viewer. Use this when you need to see exactly what will be removed before applying the redactions.",
        ),
      },
    ],
  };
};

export const useRedactWordsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.tooltip.words.header.title", "Words to Redact"),
    },
    tips: [
      {
        title: t("redact.tooltip.words.description.title", "Text Matching"),
        description: t(
          "redact.tooltip.words.description.text",
          "Enter words or phrases to find and redact in your document. Each word will be searched for separately.",
        ),
        bullets: [
          t("redact.tooltip.words.bullet1", "Add one word at a time"),
          t(
            "redact.tooltip.words.bullet2",
            "Press Enter or click '+ Add' to add",
          ),
          t("redact.tooltip.words.bullet3", "Click × to remove words"),
        ],
      },
      {
        title: t("redact.tooltip.words.examples.title", "Common Examples"),
        description: t(
          "redact.tooltip.words.examples.text",
          "Typical words to redact include: bank details, email addresses, or specific names.",
        ),
      },
    ],
  };
};

export const useRedactAdvancedTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "redact.tooltip.advanced.header.title",
        "Advanced Redaction Settings",
      ),
    },
    tips: [
      {
        title: t("redact.tooltip.advanced.color.title", "Box Colour & Padding"),
        description: t(
          "redact.tooltip.advanced.color.text",
          "Customise the appearance of redaction boxes. Black is standard, but you can choose any colour. Padding adds extra space around the found text.",
        ),
      },
      {
        title: t("redact.tooltip.advanced.matching.title", "Matching"),
        bullets: [
          t(
            "redact.tooltip.advanced.regex.bullet1",
            "Use Regex for patterns such as phone numbers, emails, or \\d{4}-\\d{2}-\\d{2} dates",
          ),
          t(
            "redact.tooltip.advanced.wholeWord.text",
            "Whole word only: 'John' won't match 'Johnson'",
          ),
          t(
            "redact.tooltip.advanced.caseSensitive.text",
            "Case sensitive: 'Secret' won't match 'SECRET'",
          ),
        ],
      },
      {
        title: t(
          "redact.tooltip.advanced.convert.title",
          "Convert to PDF-Image",
        ),
        description: t(
          "redact.tooltip.advanced.convert.text",
          "Converts the PDF to an image-based PDF after redaction. This ensures text behind redaction boxes is completely removed and unrecoverable.",
        ),
      },
    ],
  };
};

export const useRedactManualTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "redact.tooltip.manual.header.title",
        "Manual Redaction Controls",
      ),
    },
    tips: [
      {
        title: t(
          "redact.tooltip.manual.mark.title",
          "Select or draw in the viewer",
        ),
        description: t(
          "redact.tooltip.manual.mark.text",
          "Select text to mark it, or drag a rectangle for images, signatures and other shapes. Both kinds of mark are redacted together.",
        ),
      },
      {
        title: t("redact.tooltip.manual.apply.title", "Apply Redactions"),
        description: t(
          "redact.tooltip.manual.apply.text",
          "After marking content, click 'Apply' to permanently redact all marked areas. The pending count shows how many redactions are ready to be applied.",
        ),
      },
    ],
  };
};
