/**
 * Currency detection utility
 * Auto-detects user's preferred currency from browser locale
 */

const STORAGE_KEY = 'preferredCurrency';

/**
 * Map of locale codes to currency codes
 * Covers all major locales and their corresponding currencies
 */
const LOCALE_TO_CURRENCY_MAP: Record<string, string> = {
  // English variants
  'en-US': 'usd',
  'en-CA': 'usd',
  'en-AU': 'usd',
  'en-NZ': 'usd',
  'en-GB': 'gbp',
  'en-IE': 'eur',

  // European locales - Euro
  'de-DE': 'eur',
  'de-AT': 'eur',
  'de-CH': 'eur',
  'fr-FR': 'eur',
  'fr-BE': 'eur',
  'fr-CH': 'eur',
  'it-IT': 'eur',
  'es-ES': 'eur',
  'pt-PT': 'eur',
  'nl-NL': 'eur',
  'nl-BE': 'eur',
  'pl-PL': 'eur',
  'ro-RO': 'eur',
  'el-GR': 'eur',
  'fi-FI': 'eur',
  'sv-SE': 'eur',
  'da-DK': 'eur',
  'no-NO': 'eur',

  // Chinese variants
  'zh-CN': 'cny',
  'zh-TW': 'cny',
  'zh-HK': 'cny',
  'zh-SG': 'cny',

  // Indian locales
  'hi-IN': 'inr',
  'en-IN': 'inr',
  'bn-IN': 'inr',
  'te-IN': 'inr',
  'ta-IN': 'inr',
  'mr-IN': 'inr',

  // Brazilian Portuguese
  'pt-BR': 'brl',

  // Indonesian
  'id-ID': 'idr',
  'jv-ID': 'idr',

  // Other major locales defaulting to USD
  'ja-JP': 'usd',
  'ko-KR': 'usd',
  'ru-RU': 'usd',
  'ar-SA': 'usd',
  'th-TH': 'usd',
  'vi-VN': 'usd',
  'tr-TR': 'usd',
};

/**
 * Detect currency from browser locale
 * @param locale - Browser locale string (e.g., 'en-US', 'de-DE')
 * @returns Currency code ('usd', 'gbp', 'eur', etc.)
 */
export function detectCurrencyFromLocale(locale: string): string {
  // Try exact match first
  if (LOCALE_TO_CURRENCY_MAP[locale]) {
    return LOCALE_TO_CURRENCY_MAP[locale];
  }

  // Try matching just the language code (e.g., 'en' from 'en-US')
  const languageCode = locale.split('-')[0];
  const matchingLocale = Object.keys(LOCALE_TO_CURRENCY_MAP).find(
    key => key.startsWith(languageCode)
  );

  if (matchingLocale) {
    return LOCALE_TO_CURRENCY_MAP[matchingLocale];
  }

  // Default fallback to USD
  return 'usd';
}

/**
 * Get cached currency preference from localStorage
 * @returns Cached currency code or null if not set
 */
export function getCachedCurrency(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to read currency from localStorage:', error);
    return null;
  }
}

/**
 * Save currency preference to localStorage
 * @param currency - Currency code to cache
 */
export function setCachedCurrency(currency: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, currency);
  } catch (error) {
    console.warn('Failed to save currency to localStorage:', error);
  }
}

/**
 * Get preferred currency with auto-detection fallback
 * Priority: localStorage > locale detection > default (USD)
 * @param currentLocale - Current browser/i18n locale
 * @returns Currency code
 */
export function getPreferredCurrency(currentLocale: string): string {
  // 1. Check localStorage (user has previously selected)
  const cached = getCachedCurrency();
  if (cached) {
    return cached;
  }

  // 2. Auto-detect from locale
  const detected = detectCurrencyFromLocale(currentLocale);

  // 3. Cache the detection for future visits
  setCachedCurrency(detected);

  return detected;
}
