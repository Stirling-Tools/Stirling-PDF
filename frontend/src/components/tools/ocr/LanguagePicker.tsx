import React, { useState, useEffect } from 'react';
import { Stack, Text, Loader, Popover, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { tempOcrLanguages } from '../../../utils/tempOcrLanguages';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import styles from './LanguagePicker.module.css';

export interface LanguageOption {
  value: string;
  label: string;
}

export interface LanguagePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  languagesEndpoint?: string;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select language',
  disabled = false,
  label,
  languagesEndpoint = '/api/v1/ui-data/ocr-pdf'
}) => {
  const { t } = useTranslation();
  const [availableLanguages, setAvailableLanguages] = useState<LanguageOption[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);

  useEffect(() => {
    // Fetch available languages from backend
    const fetchLanguages = async () => {
      console.log('[LanguagePicker] Starting language fetch...');
      console.log('[LanguagePicker] Fetching from URL:', languagesEndpoint);

      try {
        const response = await fetch(languagesEndpoint);
        console.log('[LanguagePicker] Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });

        if (response.ok) {
          const data: { languages: string[] } = await response.json();
          const languages = data.languages;
          console.log('[LanguagePicker] Raw response data:', languages);
          console.log('[LanguagePicker] Response type:', typeof languages, 'Array?', Array.isArray(languages));

          const languageOptions = languages.map(lang => {
            // TODO: Use actual language translations when they become available
            // For now, use temporary English translations
            const translatedName = tempOcrLanguages.lang[lang as keyof typeof tempOcrLanguages.lang] || lang;
            const displayName = translatedName;

            console.log(`[LanguagePicker] Language mapping: ${lang} -> ${displayName} (translated: ${!!translatedName})`);

            return {
              value: lang,
              label: displayName
            };
          });
          console.log('[LanguagePicker] Transformed language options:', languageOptions);

          setAvailableLanguages(languageOptions);
          console.log('[LanguagePicker] Successfully set', languageOptions.length, 'languages');
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
        console.log('[LanguagePicker] Language loading completed');
      }
    };

    fetchLanguages();
  }, [languagesEndpoint]);

  if (isLoadingLanguages) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Loader size="xs" />
        <Text size="sm">Loading available languages...</Text>
      </div>
    );
  }

  const selectedLanguage = availableLanguages.find(lang => lang.value === value);

  return (
    <Box>
      {label && (
        <Text size="sm" fw={500} mb={4}>
          {label}
        </Text>
      )}
      <Popover width="target" position="bottom" withArrow={false} shadow="md">
        <Popover.Target>
          <Box
            className={`${styles.languagePicker} ${disabled ? '' : ''}`}
            style={{
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          >
            <div className={styles.languagePickerContent}>
              <Text size="sm" className={styles.languagePickerText}>
                {selectedLanguage?.label || placeholder}
              </Text>
              <UnfoldMoreIcon className={styles.languagePickerIcon} />
            </div>
          </Box>
        </Popover.Target>
        <Popover.Dropdown className={styles.languagePickerDropdown}>
          <Stack gap="xs">
            <Box className={styles.languagePickerScrollArea}>
              {availableLanguages.map((lang) => (
                <Box
                  key={lang.value}
                  className={`${styles.languagePickerOption} ${value === lang.value ? styles.selected : ''}`}
                  onClick={() => onChange(lang.value)}
                >
                  <Text size="sm">{lang.label}</Text>
                </Box>
              ))}
            </Box>
            <Box className={styles.languagePickerFooter}>
              <Text size="xs" c="dimmed" mb={4}>
                {t('ocr.languagePicker.additionalLanguages', 'Looking for additional languages?')}
              </Text>
              <Text 
                size="xs" 
                className={styles.languagePickerLink}
                onClick={() => window.open('https://docs.stirlingpdf.com/Advanced%20Configuration/OCR', '_blank')}
              >
                {t('ocr.languagePicker.viewSetupGuide', 'View setup guide →')}
              </Text>
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};

export default LanguagePicker; 