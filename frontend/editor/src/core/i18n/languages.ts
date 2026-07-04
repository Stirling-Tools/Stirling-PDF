/**
 * Shared language metadata and code helpers for the editor and portal i18n
 * setups. Pure data + string utilities — no i18next instance or app state.
 */

/** Supported languages, keyed by BCP-47-ish code → native display name. */
export const supportedLanguages: Record<string, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "ar-AR": "العربية",
  "az-AZ": "Azərbaycan Dili",
  "bg-BG": "Български",
  "ca-CA": "Català",
  "cs-CZ": "Česky",
  "da-DK": "Dansk",
  "de-DE": "Deutsch",
  "el-GR": "Ελληνικά",
  "es-ES": "Español",
  "eu-ES": "Euskara",
  "fa-IR": "فارسی",
  "fr-FR": "Français",
  "ga-IE": "Gaeilge",
  "hi-IN": "हिंदी",
  "hr-HR": "Hrvatski",
  "hu-HU": "Magyar",
  "id-ID": "Bahasa Indonesia",
  "it-IT": "Italiano",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
  "ml-ML": "മലയാളം",
  "nl-NL": "Nederlands",
  "no-NB": "Norsk",
  "pl-PL": "Polski",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português",
  "ro-RO": "Română",
  "ru-RU": "Русский",
  "sk-SK": "Slovensky",
  "sl-SI": "Slovenščina",
  "sr-LATN-RS": "Srpski",
  "sv-SE": "Svenska",
  "th-TH": "ไทย",
  "tr-TR": "Türkçe",
  "uk-UA": "Українська",
  "vi-VN": "Tiếng Việt",
  "zh-BO": "བོད་ཡིག",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

/** Right-to-left languages (drives `document.dir`). */
export const rtlLanguages = ["ar-AR", "fa-IR"];

/** LocalStorage keys for i18next language persistence. */
export const I18N_STORAGE_KEYS = {
  LANGUAGE: "i18nextLng",
  LANGUAGE_SOURCE: "i18nextLng-source",
} as const;

/**
 * Language selection priority levels.
 * Higher number = higher priority (cannot be overridden by lower priority).
 */
export enum LanguageSource {
  Fallback = 0,
  Browser = 1,
  ServerDefault = 2,
  User = 3,
}

export function normalizeLanguageCode(languageCode: string): string {
  // Replace underscores with hyphens to align with i18next/translation file naming
  const hyphenated = languageCode.replace(/_/g, "-");
  const [base, ...rest] = hyphenated.split("-");

  if (rest.length === 0) {
    return base.toLowerCase();
  }

  const normalizedParts = rest.map((part) =>
    part.length <= 3 ? part.toUpperCase() : part,
  );
  return [base.toLowerCase(), ...normalizedParts].join("-");
}

/**
 * Convert language codes to underscore format (e.g., en-US → en_US).
 * Used for backend API communication which expects underscore format.
 */
export function toUnderscoreFormat(languageCode: string): string {
  return languageCode.replace(/-/g, "_");
}

/** Convert an array of language codes to underscore format. */
export function toUnderscoreLanguages(languages: string[]): string[] {
  return languages.map(toUnderscoreFormat);
}
