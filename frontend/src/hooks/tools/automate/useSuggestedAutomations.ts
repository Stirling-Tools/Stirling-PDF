import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';

export interface SuggestedAutomation {
  id: string;
  name: string;
  description: string;
  operations: string[];
  icon: React.ComponentType<any>;
}

export function useSuggestedAutomations(): SuggestedAutomation[] {
  const { t } = useTranslation();

  const suggestedAutomations = useMemo<SuggestedAutomation[]>(() => [
    {
      id: "compress-and-merge",
      name: t("automate.suggested.compressAndMerge.name", "Compress & Merge"),
      description: t("automate.suggested.compressAndMerge.description", "Compress multiple PDFs then merge them into one"),
      operations: ["compress", "merge"],
      icon: StarIcon,
    },
    {
      id: "ocr-and-convert",
      name: t("automate.suggested.ocrAndConvert.name", "OCR & Convert"),
      description: t("automate.suggested.ocrAndConvert.description", "Apply OCR to PDFs then convert to different format"),
      operations: ["ocr", "convert"],
      icon: StarIcon,
    },
    {
      id: "secure-workflow",
      name: t("automate.suggested.secureWorkflow.name", "Secure Workflow"),
      description: t("automate.suggested.secureWorkflow.description", "Sanitize, add password, and set permissions"),
      operations: ["sanitize", "addPassword", "changePermissions"],
      icon: StarIcon,
    },
  ], [t]);

  return suggestedAutomations;
}