import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemovePagesParameters } from "../../../hooks/tools/removePages/useRemovePagesParameters";

interface RemovePagesSettingsProps {
  parameters: RemovePagesParameters;
  onParameterChange: <K extends keyof RemovePagesParameters>(key: K, value: RemovePagesParameters[K]) => void;
  disabled?: boolean;
}

// Validation function for page numbers (same as in parameters hook)
const validatePageNumbers = (pageNumbers: string): boolean => {
  if (!pageNumbers.trim()) return false;
  
  // Normalize input for validation: remove spaces around commas and other spaces
  const normalized = pageNumbers.replace(/\s*,\s*/g, ',').replace(/\s+/g, '');
  const parts = normalized.split(',');
  
  // Regular expressions for different page number formats
  const singlePageRegex = /^\d+$/; // Single page: 1, 2, 3, etc.
  const rangeRegex = /^\d+-\d*$/; // Range: 1-5, 10-, etc.
  const negativeRegex = /^-\d+$/; // Negative: -3 (last 3 pages)
  const mathRegex = /^\d*[n]\d*[+\-*/]\d+$/; // Mathematical: 2n+1, n-1, etc.
  
  return parts.every(part => {
    if (!part) return false;
    return singlePageRegex.test(part) || 
           rangeRegex.test(part) || 
           negativeRegex.test(part) || 
           mathRegex.test(part);
  });
};

const RemovePagesSettings = ({ parameters, onParameterChange, disabled = false }: RemovePagesSettingsProps) => {
  const { t } = useTranslation();

  const handlePageNumbersChange = (value: string) => {
    // Allow user to type naturally - don't normalize input in real-time
    onParameterChange('pageNumbers', value);
  };

  // Check if current input is valid
  const isValid = validatePageNumbers(parameters.pageNumbers);
  const hasValue = parameters.pageNumbers.trim().length > 0;

  return (
    <Stack gap="md">
      <TextInput
        label={t('removePages.pageNumbers.label', 'Pages to Remove')}
        value={parameters.pageNumbers}
        onChange={(event) => handlePageNumbersChange(event.currentTarget.value)}
        placeholder={t('removePages.pageNumbers.placeholder', 'e.g., 1,3,5-8,10')}
        disabled={disabled}
        required
        error={hasValue && !isValid ? t('removePages.pageNumbers.error', 'Invalid page number format. Use numbers, ranges (1-5), or mathematical expressions (2n+1)') : undefined}
      />
    </Stack>
  );
};

export default RemovePagesSettings;
