// Re-export react-i18next hook with our custom types
export { useTranslation } from 'react-i18next';

// You can add custom hooks here later if needed
// For example, a hook that returns commonly used translations
import { useTranslation as useI18nTranslation } from 'react-i18next';

export const useCommonTranslations = () => {
  const { t } = useI18nTranslation();
  
  return {
    submit: t('genericSubmit'),
    selectPdf: t('pdfPrompt'),
    selectPdfs: t('multiPdfPrompt'),
    selectImages: t('imgPrompt'),
    loading: t('loading', 'Loading...'), // fallback if not found
    error: t('error._value', 'Error'), 
    success: t('success', 'Success'),
  };
};