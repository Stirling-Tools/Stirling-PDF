import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';

export interface SuggestedAutomation {
  id: string;
  operations: string[];
  icon: React.ComponentType<any>;
}

export function useSuggestedAutomations(): SuggestedAutomation[] {
  const { t } = useTranslation();

  const suggestedAutomations = useMemo<SuggestedAutomation[]>(() => [
    {
      id: "compress-and-merge",
      operations: ["compress", "merge"],
      icon: StarIcon,
    },
    {
      id: "ocr-and-convert",
      operations: ["ocr", "convert"],
      icon: StarIcon,
    },
    {
      id: "secure-workflow",
      operations: ["sanitize", "addPassword", "changePermissions"],
      icon: StarIcon,
    },
  ], [t]);

  return suggestedAutomations;
}
