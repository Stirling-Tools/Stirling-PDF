import React, { useState, useEffect } from 'react';
import { Text, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { tempOcrLanguages } from '../../../utils/tempOcrLanguages';
import { getAutoOcrLanguage } from '../../../utils/languageMapping';
import DropdownListWithFooter, { DropdownItem } from '../../shared/DropdownListWithFooter';

export interface LanguageOption {
  value: string;
  label: string;
}

export interface LanguagePickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  languagesEndpoint?: string;
  autoFillFromBrowserLanguage?: boolean;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select languages',
  disabled = false,
  label,
  languagesEndpoint = '/api/v1/ui-data/ocr-pdf',
  autoFillFromBrowserLanguage = true,
}) => {
  const { t, i18n } = useTranslation();
  const [availableLanguages, setAvailableLanguages] = useState<DropdownItem[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);

  useEffect(() => {
    // Fetch available languages from backend
    const fetchLanguages = async () => {
      try {
        const response = await fetch(languagesEndpoint);


        if (response.ok) {
          const data: { languages: string[] } = await response.json();
          const languages = data.languages;


          const languageOptions = languages.map(lang => {
            // TODO: Use actual language translations when they become available
            // For now, use temporary English translations
            const translatedName = tempOcrLanguages.lang[lang as keyof typeof tempOcrLanguages.lang] || lang;
            const displayName = translatedName;

            return {
              value: lang,
              name: displayName
            };
          });

          setAvailableLanguages(languageOptions);
        } else {
          console.error('[LanguagePicker] Response not OK:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('[LanguagePicker] Error response body:', errorText);
        }
      } catch (error) {
        console.error('[LanguagePicker] Fetch failed with error:', error);
        console.error('[LanguagePicker] Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      } finally {
        setIsLoadingLanguages(false);
      }
    };

    fetchLanguages();
  }, [languagesEndpoint]);

  // Auto-fill OCR language based on browser language when languages are loaded
  useEffect(() => {
    const shouldAutoFillLanguage = autoFillFromBrowserLanguage && !isLoadingLanguages && availableLanguages.length > 0 && !hasAutoFilled && value.length === 0;

    if (shouldAutoFillLanguage) {
      // Use the comprehensive language mapping from languageMapping.ts
      const suggestedOcrLanguages = getAutoOcrLanguage(i18n.language);
      
      if (suggestedOcrLanguages.length > 0) {
        // Find the first suggested language that's available in the backend
        const matchingLanguage = availableLanguages.find(lang => 
          suggestedOcrLanguages.includes(lang.value)
        );
        
        if (matchingLanguage) {
          onChange([matchingLanguage.value]);
        }
      }
      
      setHasAutoFilled(true);
    }
  }, [autoFillFromBrowserLanguage, isLoadingLanguages, availableLanguages, hasAutoFilled, value.length, i18n.language, onChange]);

  if (isLoadingLanguages) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Loader size="xs" />
        <Text size="sm">Loading available languages...</Text>
      </div>
    );
  }

  const footer = (
    <>
    <div className="flex flex-col items-center gap-1 text-center">
      <Text size="xs" c="dimmed" className="text-center">
        {t('ocr.languagePicker.additionalLanguages', 'Looking for additional languages?')}
      </Text>
      <Text 
        size="xs" 
        style={{ 
          color: '#3b82f6', 
          cursor: 'pointer',
          textDecoration: 'underline',
          textAlign: 'center'
        }}
        onClick={() => window.open('https://docs.stirlingpdf.com/Advanced%20Configuration/OCR', '_blank')}
      >
        {t('ocr.languagePicker.viewSetupGuide', 'View setup guide →')}
      </Text>
    </div>
    </>
  );

  return (
    <DropdownListWithFooter
      value={value}
      onChange={(newValue) => onChange(newValue as string[])}
      items={availableLanguages}
      placeholder={placeholder}
      disabled={disabled}
      label={label}
      footer={footer}
      multiSelect={true}
      maxHeight={300}
      searchable={true}
    />
  );
};

export default LanguagePicker; 