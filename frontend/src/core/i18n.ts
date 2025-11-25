import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Define supported languages (based on your existing translations)
export const supportedLanguages = {
  'en-GB': 'English',
  'ar-AR': 'العربية',
  'az-AZ': 'Azərbaycan Dili',
  'bg-BG': 'Български',
  'ca-CA': 'Català',
  'cs-CZ': 'Česky',
  'da-DK': 'Dansk',
  'de-DE': 'Deutsch',
  'el-GR': 'Ελληνικά',
  'es-ES': 'Español',
  'eu-ES': 'Euskara',
  'fa-IR': 'فارسی',
  'fr-FR': 'Français',
  'ga-IE': 'Gaeilge',
  'hi-IN': 'हिंदी',
  'hr-HR': 'Hrvatski',
  'hu-HU': 'Magyar',
  'id-ID': 'Bahasa Indonesia',
  'it-IT': 'Italiano',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'ml-ML': 'മലയാളം',
  'nl-NL': 'Nederlands',
  'no-NB': 'Norsk',
  'pl-PL': 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português',
  'ro-RO': 'Română',
  'ru-RU': 'Русский',
  'sk-SK': 'Slovensky',
  'sl-SI': 'Slovenščina',
  'sr-LATN-RS': 'Srpski',
  'sv-SE': 'Svenska',
  'th-TH': 'ไทย',
  'tr-TR': 'Türkçe',
  'uk-UA': 'Українська',
  'vi-VN': 'Tiếng Việt',
  'zh-BO': 'བོད་ཡིག',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

// RTL languages (based on your existing language.direction property)
export const rtlLanguages = ['ar-AR', 'fa-IR'];

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-GB',
    supportedLngs: Object.keys(supportedLanguages),
    load: 'currentOnly',
    nonExplicitSupportedLngs: false,
    debug: process.env.NODE_ENV === 'development',

    // Ensure synchronous loading to prevent timing issues
    initImmediate: false,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    backend: {
      loadPath: (lngs: string[], namespaces: string[]) => {
        const lng = lngs[0];
        const basePath = import.meta.env.BASE_URL || '/';
        const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        return `${cleanBasePath}/locales/${lng}/${namespaces[0]}.json`;
      },
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      convertDetectedLanguage: (lng: string) => {
        // Map en and en-US to en-GB
        if (lng === 'en' || lng === 'en-US') return 'en-GB';
        return lng;
      },
    },

    react: {
      useSuspense: true, // Enable suspense to prevent premature rendering
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
      transEmptyNodeValue: '', // Return empty string for missing keys instead of key name
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
    },
  });


// Set document direction based on language
i18n.on('languageChanged', (lng) => {
  const isRTL = rtlLanguages.includes(lng);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

/**
 * Updates the supported languages list dynamically based on config
 * If configLanguages is null/empty, all languages remain available
 * Otherwise, only specified languages plus 'en-GB' fallback are enabled
 */
export function updateSupportedLanguages(configLanguages?: string[] | null) {
  if (!configLanguages || configLanguages.length === 0) {
    // No filter specified - keep all languages
    return;
  }

  // Ensure fallback language is always included
  const languagesToSupport = new Set(['en-GB', ...configLanguages]);

  // Filter to only valid language codes that exist in our translations
  const validLanguages = Array.from(languagesToSupport).filter(
    lang => lang in supportedLanguages
  );

  if (validLanguages.length > 0) {
    i18n.options.supportedLngs = validLanguages;

    // If current language is not in the new supported list, switch to fallback
    const currentLang = i18n.language;
    if (currentLang && !validLanguages.includes(currentLang)) {
      i18n.changeLanguage('en-GB');
    }
  }
}

export default i18n;
