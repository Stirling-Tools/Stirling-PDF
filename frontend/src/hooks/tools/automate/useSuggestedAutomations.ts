import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import { SuggestedAutomation } from '../../../types/automation';

export function useSuggestedAutomations(): SuggestedAutomation[] {
  const { t } = useTranslation();

  const suggestedAutomations = useMemo<SuggestedAutomation[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        id: "compress-and-merge",
        name: t("automation.suggested.compressAndMerge", "Compress & Merge"),
        description: t("automation.suggested.compressAndMergeDesc", "Compress PDFs and merge them into one file"),
        operations: [
          { operation: "compress", parameters: {} },
          { operation: "merge", parameters: {} }
        ],
        createdAt: now,
        updatedAt: now,
        icon: StarIcon,
      },
      {
        id: "ocr-and-convert",
        name: t("automation.suggested.ocrAndConvert", "OCR & Convert"),
        description: t("automation.suggested.ocrAndConvertDesc", "Extract text via OCR and convert to different format"),
        operations: [
          { operation: "ocr", parameters: {} },
          { operation: "convert", parameters: {} }
        ],
        createdAt: now,
        updatedAt: now,
        icon: StarIcon,
      },
      {
        id: "secure-workflow",
        name: t("automation.suggested.secureWorkflow", "Secure Workflow"),
        description: t("automation.suggested.secureWorkflowDesc", "Sanitize, add password, and set permissions"),
        operations: [
          { operation: "sanitize", parameters: {} },
          { operation: "addPassword", parameters: {} },
          { operation: "changePermissions", parameters: {} }
        ],
        createdAt: now,
        updatedAt: now,
        icon: StarIcon,
      },
    ];
  }, [t]);

  return suggestedAutomations;
}
