import i18n, { type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import LocaleBackend, {
  FULL_FILE,
  STARTUP_FILE,
  localeFileUrl,
  markDictionaryComplete,
  isDictionaryComplete,
  pendingDictionaryLoad,
  startDictionaryLoad,
} from "@app/i18n/localeBackend";
import {
  supportedLanguages,
  rtlLanguages,
  I18N_STORAGE_KEYS,
  LanguageSource,
  normalizeLanguageCode,
  toUnderscoreFormat,
  toUnderscoreLanguages,
} from "@app/i18n/languages";

// Language metadata and code helpers are shared with the portal via
// @app/i18n. Re-export them so existing `@app/i18n` consumers are unchanged.
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
  .use(LocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
// No fallback language. Each delivery file already carries the source strings for the keys its language is.
    fallbackLng: false,
    supportedLngs: Object.keys(supportedLanguages),
    load: "currentOnly",
    nonExplicitSupportedLngs: false,
    debug: process.env.NODE_ENV === "development",

    // Ensure synchronous loading to prevent timing issues
    initAsync: false,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    backend: {
// JSON rather than the authored TOML: the parse happens at build time, and `scripts/generate-locale-assets.mjs`.
      loadPath: (lngs: string[]) => {
        const language = lngs[0];
// The language loaded at init needs only the startup subset: the keys the first screen resolves, ~7 KiB brotli.
        if (i18n.isInitialized) {
          return localeFileUrl(language, FULL_FILE);
        }
        return localeFileUrl(language, STARTUP_FILE);
      },
      // Covers a missing or corrupt file, not missing keys.
      fallbackLocale: "en-US",
    },

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: [], // Don't cache auto-detected language - only cache when user manually selects
      convertDetectedLanguage: (lng: string) => {
        // Map bare en to en-US
        const normalized = normalizeLanguageCode(lng);
        return normalized === "en" ? "en-US" : normalized;
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

/** Resolves once the first locale is loaded. */
export const i18nReady: Promise<void> = i18n.isInitialized
  ? Promise.resolve()
  : new Promise((resolve) => {
      i18n.on("initialized", () => {
        resolve();
      });
    });

/** Loads the complete dictionary for a route that renders keys outside the startup subset, and reports failure. */
export async function loadFullDictionary(
  language: string = i18n.language,
): Promise<void> {
  if (!language || isDictionaryComplete(language)) return;
  const pending = pendingDictionaryLoad(language);
  if (pending) return pending;
  await startDictionaryLoad(language, async () => {
    const url = localeFileUrl(language, FULL_FILE);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load translation file: ${url} (${response.status})`);
    }
    const dictionary = (await response.json()) as ResourceKey;
    i18n.addResourceBundle(language, "translation", dictionary, true, false);
    markDictionaryComplete(language);
  });
}

/** Fetches the complete dictionary on the user's first interaction. */
export function installFullDictionaryOnIntent(): void {
  const load = () => {
    document.removeEventListener("pointerdown", load, { capture: true });
    document.removeEventListener("keydown", load, { capture: true });
    void prefetchFullDictionary();
  };
  document.addEventListener("pointerdown", load, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", load, { capture: true, passive: true });
}

/** `loadFullDictionary` with its failure reduced to a warning. */
async function prefetchFullDictionary(
  language: string = i18n.language,
): Promise<void> {
  try {
    await loadFullDictionary(language);
  } catch (error) {
    // A rejected fetch means no delivery server answered at all; anything else
    // is a file the build should have written, which is worth naming.
    if (error instanceof TypeError) return;
    console.warn(`[i18n] ${String(error)}`);
  }
}

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
    ? sourceNum
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
    if (
      normalizeLanguageCode(i18n.language || "") !==
      normalizeLanguageCode(language)
    ) {
      i18n.changeLanguage(language);
    }
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
 * Otherwise, only the specified languages are enabled, and the first valid
 * option (preferring en-US when present) becomes the language used when the
 * current one is not allowed.
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

// The language to move to when the current one is not allowed: prefer validDefault if in the list, then en-US.
  const fallback =
    validDefault && validLanguages.includes(validDefault)
      ? validDefault
      : validLanguages.includes("en-US")
        ? "en-US"
        : validLanguages[0];

  i18n.options.supportedLngs = validLanguages;

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

// Non-React modules off the hydration path (diskFileSync's toasts) read the
// translator from globalThis; the ESM build does not register itself.
(globalThis as Record<string, unknown>).i18next = i18n;

export default i18n;
