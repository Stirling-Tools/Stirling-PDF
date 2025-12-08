import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRedactModeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.tooltip.mode.header.title", "Redaction Method")
    },
    tips: [
      {
        title: t("redact.tooltip.mode.automatic.title", "Automatic Redaction"),
        description: t("redact.tooltip.mode.automatic.text", "Automatically finds and redacts specified text throughout the document. Perfect for removing consistent sensitive information like names, SSNs, or confidential markers.")
      },
      {
        title: t("redact.tooltip.mode.manual.title", "Manual Redaction"),
        description: t("redact.tooltip.mode.manual.text", "Click and drag to manually select specific areas to redact. Gives you precise control over what gets redacted. (Coming soon)")
      }
    ]
  };
};

export const useRedactWordsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.tooltip.words.header.title", "Words to Redact")
    },
    tips: [
      {
        title: t("redact.tooltip.words.description.title", "Text Matching"),
        description: t("redact.tooltip.words.description.text", "Enter words or phrases to find and redact in your document. Each word will be searched for separately."),
        bullets: [
          t("redact.tooltip.words.bullet1", "Add one word at a time"),
          t("redact.tooltip.words.bullet2", "Press Enter or click 'Add Another' to add"),
          t("redact.tooltip.words.bullet3", "Click × to remove words")
        ]
      },
      {
        title: t("redact.tooltip.words.examples.title", "Common Examples"),
        description: t("redact.tooltip.words.examples.text", "Typical words to redact include: bank details, email addresses, or specific names.")
      }
    ]
  };
};

export const useRedactAdvancedTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.tooltip.advanced.header.title", "Advanced Redaction Settings")
    },
    tips: [
      {
        title: t("redact.tooltip.advanced.color.title", "Box Colour & Padding"),
        description: t("redact.tooltip.advanced.color.text", "Customise the appearance of redaction boxes. Black is standard, but you can choose any colour. Padding adds extra space around the found text."),
      },
      {
        title: t("redact.tooltip.advanced.regex.title", "Use Regex"),
        description: t("redact.tooltip.advanced.regex.text", "Enable regular expressions for advanced pattern matching. Useful for finding phone numbers, emails, or complex patterns."),
        bullets: [
          t("redact.tooltip.advanced.regex.bullet1", "Example: \\d{4}-\\d{2}-\\d{2} to match any dates in YYYY-MM-DD format"),
          t("redact.tooltip.advanced.regex.bullet2", "Use with caution - test thoroughly")
        ]
      },
      {
        title: t("redact.tooltip.advanced.wholeWord.title", "Whole Word Search"),
        description: t("redact.tooltip.advanced.wholeWord.text", "Only match complete words, not partial matches. 'John' won't match 'Johnson' when enabled.")
      },
      {
        title: t("redact.tooltip.advanced.convert.title", "Convert to PDF-Image"),
        description: t("redact.tooltip.advanced.convert.text", "Converts the PDF to an image-based PDF after redaction. This ensures text behind redaction boxes is completely removed and unrecoverable.")
      }
    ]
  };
};
