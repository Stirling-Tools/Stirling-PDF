import React, { useState, useEffect } from 'react';
import { Stack, Text, Loader, Popover, useMantineTheme, useMantineColorScheme, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { tempOcrLanguages } from '../../../utils/tempOcrLanguages';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';

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
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
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

  // Get appropriate background colors based on color scheme
  const getBackgroundColor = () => {
    if (colorScheme === 'dark') {
      return '#2A2F36'; // Specific dark background color
    }
    return 'white'; // White background for light mode
  };

  const getSelectedItemBackgroundColor = () => {
    if (colorScheme === 'dark') {
      return 'var(--mantine-color-blue-8)'; // Darker blue for better contrast
    }
    return 'var(--mantine-color-blue-1)'; // Light blue for light mode
  };

  const getSelectedItemTextColor = () => {
    if (colorScheme === 'dark') {
      return 'white'; // White text for dark mode selected items
    }
    return 'var(--mantine-color-blue-9)'; // Dark blue text for light mode
  };

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
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center', // Center align items vertically
              height: '32px',
              border: `1px solid var(--border-default)`,
              backgroundColor: getBackgroundColor(),
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '13px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            <Text size="sm" style={{ flex: 1 }}>
              {selectedLanguage?.label || placeholder}
            </Text>
            <UnfoldMoreIcon style={{ 
              fontSize: '16px', 
              color: 'var(--text-muted)', 
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center'
            }} />
          </Box>
        </Popover.Target>
        <Popover.Dropdown style={{
          backgroundColor: getBackgroundColor(),
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px'
        }}>
          <Stack gap="xs">
            <Box style={{
              maxHeight: '180px',
              overflowY: 'auto',
              borderBottom: '1px solid var(--border-default)',
              paddingBottom: '8px'
            }}>
              {availableLanguages.map((lang) => (
                <Box
                  key={lang.value}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '13px',
                    color: value === lang.value ? getSelectedItemTextColor() : 'var(--text-primary)',
                    backgroundColor: value === lang.value ? getSelectedItemBackgroundColor() : 'transparent',
                    transition: 'background-color 0.2s ease'
                  }}
                  onClick={() => onChange(lang.value)}
                >
                  <Text size="sm">{lang.label}</Text>
                </Box>
              ))}
            </Box>
            <Box style={{
              padding: '8px',
              textAlign: 'center',
              fontSize: '12px'
            }}>
              <Text size="xs" c="dimmed" mb={4}>
                Looking for additional languages?
              </Text>
              <Text 
                size="xs" 
                c="blue" 
                style={{ textDecoration: 'underline', cursor: 'pointer' }}
                onClick={() => window.open('https://docs.stirlingpdf.com/Advanced%20Configuration/OCR', '_blank')}
              >
                View setup guide →
              </Text>
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};

export default LanguagePicker; 