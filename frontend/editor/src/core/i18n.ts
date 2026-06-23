import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import TomlBackend from "@shared/i18n/tomlBackend";
import {
  supportedLanguages,
  rtlLanguages,
  I18N_STORAGE_KEYS,
  LanguageSource,
  normalizeLanguageCode,
  toUnderscoreFormat,
  toUnderscoreLanguages,
} from "@shared/i18n/languages";

// Language metadata and code helpers are shared with the portal via
// @shared/i18n. Re-export them so existing `@app/i18n` consumers are unchanged.
export {
  supportedLanguages,
  rtlLanguages,
  I18N_STORAGE_KEYS,
  LanguageSource,
  normalizeLanguageCode,
  toUnderscoreFormat,
  toUnderscoreLanguages,
};

i18n
  .use(TomlBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en-US",
    supportedLngs: Object.keys(supportedLanguages),
    load: "currentOnly",
    nonExplicitSupportedLngs: false,
    debug: process.env.NODE_ENV === "development",

    // Ensure synchronous loading to prevent timing issues
    initImmediate: false,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    backend: {
      loadPath: (lngs: string[], namespaces: string[]) => {
        const lng = lngs[0];
        const basePath = import.meta.env.BASE_URL || "/";
        const cleanBasePath = basePath.endsWith("/")
          ? basePath.slice(0, -1)
          : basePath;
        return `${cleanBasePath}/locales/${lng}/${namespaces[0]}.toml`;
      },
    },

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: [], // Don't cache auto-detected language - only cache when user manually selects
      convertDetectedLanguage: (lng: string) => {
        // Map bare en to en-US
        if (lng === "en") return "en-US";
        return lng;
      },
    },

    react: {
      useSuspense: true, // Enable suspense to prevent premature rendering
      bindI18n: "languageChanged loaded",
      bindI18nStore: "added removed",
      transEmptyNodeValue: "", // Return empty string for missing keys instead of key name
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
    },
  });

// Set document direction based on language
i18n.on("languageChanged", (lng) => {
  const isRTL = rtlLanguages.includes(lng);
  document.documentElement.dir = isRTL ? "rtl" : "ltr";
  document.documentElement.lang = lng;
});

// Track browser-detected language on first initialization
i18n.on("initialized", () => {
  // If no source is set yet, mark current language as browser-detected
  if (!localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE)) {
    const detectedLang = i18n.language;
    if (detectedLang) {
      localStorage.setItem(I18N_STORAGE_KEYS.LANGUAGE, detectedLang);
      localStorage.setItem(
        I18N_STORAGE_KEYS.LANGUAGE_SOURCE,
        String(LanguageSource.Browser),
      );
    }
  }
});

/**
 * Get the current language source priority
 */
function getCurrentSourcePriority(): LanguageSource {
  const sourceStr = localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE);
  const sourceNum = sourceStr ? parseInt(sourceStr, 10) : null;
  return sourceNum !== null && !isNaN(sourceNum)
    ? (sourceNum as LanguageSource)
    : LanguageSource.Fallback;
}

/**
 * Set language with priority tracking
 * Only updates if new source has equal or higher priority than current
 */
function setLanguageWithPriority(
  language: string,
  source: LanguageSource,
): boolean {
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
 * option (preferring en-US when present) used as the fallback language.
 *
 * @param configLanguages - Optional array of language codes from server config (ui.languages)
 * @param defaultLocale - Optional default language for new users (system.defaultLocale)
 */
export function updateSupportedLanguages(
  configLanguages?: string[] | null,
  defaultLocale?: string | null,
) {
  // Normalize and validate default locale if provided
  const normalizedDefault = defaultLocale
    ? normalizeLanguageCode(defaultLocale)
    : null;
  const validDefault =
    normalizedDefault && normalizedDefault in supportedLanguages
      ? normalizedDefault
      : null;

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
    .filter((lang) => lang in supportedLanguages);

  // If no valid languages were provided, keep existing configuration
  if (validLanguages.length === 0) {
    return;
  }

  // Determine fallback: prefer validDefault if in the list, then en-US, then first valid language
  const fallback =
    validDefault && validLanguages.includes(validDefault)
      ? validDefault
      : validLanguages.includes("en-US")
        ? "en-US"
        : validLanguages[0];

  i18n.options.supportedLngs = validLanguages;
  i18n.options.fallbackLng = fallback;

  // If current language is not in the new supported list, switch to fallback with higher priority to override browser detection
  const currentLang = normalizeLanguageCode(i18n.language || "");
  if (currentLang && !validLanguages.includes(currentLang)) {
    // Use ServerDefault priority to override browser detection when language not in whitelist
    setLanguageWithPriority(fallback, LanguageSource.ServerDefault);
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
