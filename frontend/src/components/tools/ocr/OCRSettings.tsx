import React, { useState, useEffect } from 'react';
import { Stack, Select, MultiSelect, Text, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { tempOcrLanguages } from '../../../utils/tempOcrLanguages';

export interface OCRParameters {
  languages: string[];
  ocrType: string;
  ocrRenderType: string;
  additionalOptions: string[];
}

interface OCRSettingsProps {
  parameters: OCRParameters;
  onParameterChange: (key: keyof OCRParameters, value: any) => void;
  disabled?: boolean;
}

const OCRSettings: React.FC<OCRSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled = false
}) => {
  const { t } = useTranslation();
  const [availableLanguages, setAvailableLanguages] = useState<{value: string, label: string}[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);

  // Define the additional options available
  const additionalOptionsData = [
    { value: 'sidecar', label: 'Create sidecar text file' },
    { value: 'deskew', label: 'Deskew pages' },
    { value: 'clean', label: 'Clean input file' },
    { value: 'cleanFinal', label: 'Clean final output' },
    { value: 'removeImagesAfter', label: 'Remove images after OCR' },
  ];

  useEffect(() => {
    // Fetch available languages from backend
    const fetchLanguages = async () => {
      console.log('[OCR Languages] Starting language fetch...');
      const url = '/api/v1/ui-data/ocr-pdf';
      console.log('[OCR Languages] Fetching from URL:', url);
      
      try {
        const response = await fetch(url);
        console.log('[OCR Languages] Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (response.ok) {
          const data: { languages: string[] } = await response.json();
          const languages = data.languages;
          console.log('[OCR Languages] Raw response data:', languages);
          console.log('[OCR Languages] Response type:', typeof languages, 'Array?', Array.isArray(languages));
          
          const languageOptions = languages.map(lang => {
            // TODO: Use actual language translations when they become available
            // For now, use temporary English translations
            const translatedName = tempOcrLanguages.lang[lang as keyof typeof tempOcrLanguages.lang] || lang;
            const displayName = translatedName;
            
            console.log(`[OCR Languages] Language mapping: ${lang} -> ${displayName} (translated: ${!!translatedName})`);
            
            return {
              value: lang,
              label: displayName
            };
          });
          console.log('[OCR Languages] Transformed language options:', languageOptions);
          
          setAvailableLanguages(languageOptions);
          console.log('[OCR Languages] Successfully set', languageOptions.length, 'languages');
        } else {
          console.error('[OCR Languages] Response not OK:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('[OCR Languages] Error response body:', errorText);
        }
      } catch (error) {
        console.error('[OCR Languages] Fetch failed with error:', error);
        console.error('[OCR Languages] Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      } finally {
        setIsLoadingLanguages(false);
        console.log('[OCR Languages] Language loading completed');
      }
    };

    fetchLanguages();
  }, [t]); // Add t to dependencies since we're using it in the effect

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>OCR Configuration</Text>
      
      {isLoadingLanguages ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Loader size="xs" />
          <Text size="sm">Loading available languages...</Text>
        </div>
      ) : (
        <Select
          label="Languages"
          placeholder="Select primary language for OCR"
          value={parameters.languages[0] || ''}
          onChange={(value) => onParameterChange('languages', value ? [value] : [])}
          data={availableLanguages}
          disabled={disabled}
          clearable
        />
      )}

      <Select
        label="OCR Mode"
        value={parameters.ocrType}
        onChange={(value) => onParameterChange('ocrType', value || 'skip-text')}
        data={[
          { value: 'skip-text', label: 'Auto (skip text layers)' },
          { value: 'force-ocr', label: 'Force OCR - Process all pages' },
          { value: 'Normal', label: 'Normal - Error if text exists' },
        ]}
        disabled={disabled}
      />

      <Select
        label="Output"
        value={parameters.ocrRenderType}
        onChange={(value) => onParameterChange('ocrRenderType', value || 'hocr')}
        data={[
          { value: 'hocr', label: 'Searchable PDF (sandwich)' },
          { value: 'sandwich', label: 'Sandwich' },
        ]}
        disabled={disabled}
      />

      <MultiSelect
        label="Additional Options"
        placeholder="Select additional options"
        value={parameters.additionalOptions}
        onChange={(value) => onParameterChange('additionalOptions', value)}
        data={additionalOptionsData}
        disabled={disabled}
        clearable
        styles={{
          input: {
            backgroundColor: 'var(--mantine-color-gray-1)',
            borderColor: 'var(--mantine-color-gray-3)',
          },
          dropdown: {
            backgroundColor: 'var(--mantine-color-gray-1)',
          }
        }}
      />
    </Stack>
  );
};

export default OCRSettings; 