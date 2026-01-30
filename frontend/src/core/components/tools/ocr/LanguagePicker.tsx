import React, { useState, useEffect } from 'react';
import { Text, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getAutoOcrLanguage, getBrowserLanguagesForOcr, getOcrDisplayName } from '@app/utils/languageMapping';
import apiClient from '@app/services/apiClient';
import DropdownListWithFooter, { DropdownItem } from '@app/components/shared/DropdownListWithFooter';

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
        const { data } = await apiClient.get<{ languages: string[] }>(languagesEndpoint);

        const displayNames = typeof Intl.DisplayNames !== 'undefined'
          ? new Intl.DisplayNames([i18n.language], { type: 'language' })
          : null;

        const languageOptions = [...new Set(data.languages)]
          .map((lang) => {
            const displayName = getOcrDisplayName(lang);
            const browserLanguageCodes = getBrowserLanguagesForOcr(lang);

            const langKey = `lang.${lang}`;
            const translatedFromKey = t(langKey);
            const hasKeyTranslation = translatedFromKey !== langKey;

            const intlTranslatedName = displayNames
              ? browserLanguageCodes
                  .map((code) => displayNames.of(code))
                  .find((name): name is string => Boolean(name))
              : null;

            const translatedName =
              (hasKeyTranslation ? translatedFromKey : null)
              || intlTranslatedName
              || t(`ocr.languages.${lang}`, displayName);

            return {
              value: lang,
              name: translatedName,
              label: translatedName
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, i18n.language));

        setAvailableLanguages(languageOptions);
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
  }, [languagesEndpoint, i18n.language, t]);

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
        onClick={() => window.open('https://docs.stirlingpdf.com/Configuration/OCR', '_blank')}
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
