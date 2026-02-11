import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import TomlBackend from '@app/i18n/tomlBackend';

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

// LocalStorage keys for i18next
export const I18N_STORAGE_KEYS = {
  LANGUAGE: 'i18nextLng',
  LANGUAGE_SOURCE: 'i18nextLng-source',
} as const;

/**
 * Language selection priority levels
 * Higher number = higher priority (cannot be overridden by lower priority)
 */
export enum LanguageSource {
  Fallback = 0,
  Browser = 1,
  ServerDefault = 2,
  User = 3,
}

i18n
  .use(TomlBackend)
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
        return `${cleanBasePath}/locales/${lng}/${namespaces[0]}.toml`;
      },
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: [], // Don't cache auto-detected language - only cache when user manually selects
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

// Track browser-detected language on first initialization
i18n.on('initialized', () => {
  // If no source is set yet, mark current language as browser-detected
  if (!localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE)) {
    const detectedLang = i18n.language;
    if (detectedLang) {
      localStorage.setItem(I18N_STORAGE_KEYS.LANGUAGE, detectedLang);
      localStorage.setItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE, String(LanguageSource.Browser));
    }
  }
});

export function normalizeLanguageCode(languageCode: string): string {
  // Replace underscores with hyphens to align with i18next/translation file naming
  const hyphenated = languageCode.replace(/_/g, '-');
  const [base, ...rest] = hyphenated.split('-');

  if (rest.length === 0) {
    return base.toLowerCase();
  }

  const normalizedParts = rest.map(part => (part.length <= 3 ? part.toUpperCase() : part));
  return [base.toLowerCase(), ...normalizedParts].join('-');
}

/**
 * Convert language codes to underscore format (e.g., en-GB → en_GB)
 * Used for backend API communication which expects underscore format
 */
export function toUnderscoreFormat(languageCode: string): string {
  return languageCode.replace(/-/g, '_');
}

/**
 * Convert array of language codes to underscore format
 */
export function toUnderscoreLanguages(languages: string[]): string[] {
  return languages.map(toUnderscoreFormat);
}


/**
 * Get the current language source priority
 */
function getCurrentSourcePriority(): LanguageSource {
  const sourceStr = localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE);
  const sourceNum = sourceStr ? parseInt(sourceStr, 10) : null;
  return (sourceNum !== null && !isNaN(sourceNum)) ? sourceNum as LanguageSource : LanguageSource.Fallback;
}

/**
 * Set language with priority tracking
 * Only updates if new source has equal or higher priority than current
 */
function setLanguageWithPriority(language: string, source: LanguageSource): boolean {
  const currentPriority = getCurrentSourcePriority();
  const newPriority = source;

  // Only apply if new source has higher priority
  if (newPriority >= currentPriority) {
    i18n.changeLanguage(language);
    localStorage.setItem(I18N_STORAGE_KEYS.LANGUAGE, language);
    localStorage.setItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE, String(source));
    return true;
  }
  return false;
}

/**
 * Set user-selected language (highest priority)
 * Call this from the UI language selector
 */
export function setUserLanguage(language: string): void {
  setLanguageWithPriority(language, LanguageSource.User);
}

/**
 * Updates the supported languages list dynamically based on config
 * If configLanguages is null/empty, all languages remain available
 * Otherwise, only the specified languages are enabled with the first valid
 * option (preferring en-GB when present) used as the fallback language.
 *
 * @param configLanguages - Optional array of language codes from server config (ui.languages)
 * @param defaultLocale - Optional default language for new users (system.defaultLocale)
 */
export function updateSupportedLanguages(configLanguages?: string[] | null, defaultLocale?: string | null) {
  // Normalize and validate default locale if provided
  const normalizedDefault = defaultLocale ? normalizeLanguageCode(defaultLocale) : null;
  const validDefault = normalizedDefault && normalizedDefault in supportedLanguages ? normalizedDefault : null;

  if (!configLanguages || configLanguages.length === 0) {
    // No filter specified - keep all languages
    // But still apply default locale if provided and user has no preference
    if (validDefault) {
      applyDefaultLocale(validDefault);
    }
    return;
  }

  const validLanguages = configLanguages
    .map(normalizeLanguageCode)
    .filter(lang => lang in supportedLanguages);

  // If no valid languages were provided, keep existing configuration
  if (validLanguages.length === 0) {
    return;
  }

  // Determine fallback: prefer validDefault if in the list, then en-GB, then first valid language
  const fallback = validDefault && validLanguages.includes(validDefault)
    ? validDefault
    : validLanguages.includes('en-GB')
      ? 'en-GB'
      : validLanguages[0];

  i18n.options.supportedLngs = validLanguages;
  i18n.options.fallbackLng = fallback;

  // If current language is not in the new supported list, switch to fallback
  const currentLang = normalizeLanguageCode(i18n.language || '');
  if (currentLang && !validLanguages.includes(currentLang)) {
    setLanguageWithPriority(fallback, LanguageSource.Fallback);
  } else if (validDefault) {
    // Apply server default (respects user choice if already set)
    setLanguageWithPriority(validDefault, LanguageSource.ServerDefault);
  }
}

/**
 * Apply server default locale when user has no saved language preference
 * This respects the priority: user-selected language > defaultLocale > browser detection > fallback
 */
function applyDefaultLocale(defaultLocale: string) {
  // Apply server default (respects user choice if already set)
  setLanguageWithPriority(defaultLocale, LanguageSource.ServerDefault);
}

export default i18n;
