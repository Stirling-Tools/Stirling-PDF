import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRedactModeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.help.modeTitle", "Redaction Method")
    },
    tips: [
      {
        title: t("redact.help.overview", "Overview"),
        description: t("redact.help.overviewDesc", "Redaction permanently removes sensitive content from PDFs. Text behind redaction boxes is completely removed, not just covered. Metadata is also cleaned automatically.")
      },
      {
        title: t("redact.help.automaticMode", "Automatic Redaction"),
        description: t("redact.help.automaticDesc", "Search for specific words, phrases, or patterns throughout the document and automatically redact all matches. Supports text search and regular expressions.")
      }
    ]
  };
};

export const useRedactWordsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.help.wordsTitle", "Words & Patterns to Redact")
    },
    tips: [
      {
        title: t("redact.help.enterWords", "Enter Text to Redact"),
        description: t("redact.help.enterWordsDesc", "Type the words or phrases you want to remove from the document. Each word/phrase will be searched and redacted automatically."),
        bullets: [
          t("redact.help.enterWordsBullet1", "Enter one or more words separated by commas"),
          t("redact.help.enterWordsBullet2", "Case sensitive by default"),
          t("redact.help.enterWordsBullet3", "Use whole word search to avoid partial matches")
        ]
      },
      {
        title: t("redact.help.wholeWordMode", "Whole Word Search"),
        description: t("redact.help.wholeWordDesc", "Enable 'Whole Word Search' to match only complete words. Example: 'John' won't match 'Johnson' when enabled. Useful for names.")
      },
      {
        title: t("redact.help.regexMode", "Regular Expression (Regex) Mode"),
        description: t("redact.help.regexDesc", "Enable 'Use Regex' to use pattern-based matching for complex searches. Powerful for finding multiple instances of similar data.")
      },
      {
        title: t("redact.help.regexExamples", "Common Regex Patterns"),
        description: "",
        bullets: [
          t("redact.help.regexSSN", "Social Security Number: \\d{3}-\\d{2}-\\d{4} (matches XXX-XX-XXXX)"),
          t("redact.help.regexPhone", "Phone Number: \\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4} (matches various phone formats)"),
          t("redact.help.regexEmail", "Email Address: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,} (matches email addresses)"),
          t("redact.help.regexCreditCard", "Credit Card: \\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4} (matches card numbers)"),
          t("redact.help.regexDate", "Date (YYYY-MM-DD): \\d{4}-\\d{2}-\\d{2}"),
          t("redact.help.regexZipCode", "US ZIP Code: \\d{5}(-\\d{4})? (matches 12345 or 12345-6789)"),
          t("redact.help.regexIPAddress", "IP Address: \\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")
        ]
      }
    ]
  };
};

export const useRedactAdvancedTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("redact.help.advancedTitle", "Advanced Settings")
    },
    tips: [
      {
        title: t("redact.help.customColor", "Custom Redaction Color"),
        description: t("redact.help.customColorDesc", "Choose the color of the redaction boxes. Default is black for maximum privacy.")
      },
      {
        title: t("redact.help.padding", "Custom Padding"),
        description: t("redact.help.paddingDesc", "Add extra space around redaction boxes to ensure complete coverage. Useful when fonts vary in size or style.")
      },
      {
        title: t("redact.help.securityFeatures", "Security Features"),
        description: "",
        bullets: [
          t("redact.help.securityConvert", "Convert to PDF-Image: Converts the entire PDF to images after redaction. This ensures text is truly unrecoverable. Note: Increases file size and makes text non-selectable."),
          t("redact.help.securityMetadata", "Automatic Metadata Cleaning: Automatically removes author, subject, keywords, and XMP metadata for privacy.")
        ]
      },
      {
        title: t("redact.help.tips", "Best Practices"),
        description: "",
        bullets: [
          t("redact.help.tip1", "Test First: Test your regex patterns on a copy before using on important documents."),
          t("redact.help.tip2", "Review Results: Always review redacted documents to ensure all sensitive information is removed."),
          t("redact.help.tip3", "Use Convert to Image: For highly sensitive documents, enable 'Convert to PDF-Image' to ensure complete removal."),
          t("redact.help.tip4", "Padding: Add custom padding to ensure redaction boxes fully cover text (useful for different font sizes).")
        ]
      }
    ]
  };
};
