// Mapping from browser language codes to OCR language codes
// Handles exact matches and similar language fallbacks

interface LanguageMapping {
  [browserCode: string]: string;
}

// Primary mapping from browser language codes to OCR language codes
const browserToOcrMapping: LanguageMapping = {
  // English variants
  'en': 'eng',
  'en-US': 'eng',
  'en-GB': 'eng',
  'en-AU': 'eng',
  'en-CA': 'eng',
  'en-IE': 'eng',
  'en-NZ': 'eng',
  'en-ZA': 'eng',
  
  // Spanish variants
  'es': 'spa',
  'es-ES': 'spa',
  'es-MX': 'spa',
  'es-AR': 'spa',
  'es-CO': 'spa',
  'es-CL': 'spa',
  'es-PE': 'spa',
  'es-VE': 'spa',
  
  // French variants
  'fr': 'fra',
  'fr-FR': 'fra',
  'fr-CA': 'fra',
  'fr-BE': 'fra',
  'fr-CH': 'fra',
  
  // German variants
  'de': 'deu',
  'de-DE': 'deu',
  'de-AT': 'deu',
  'de-CH': 'deu',
  
  // Portuguese variants
  'pt': 'por',
  'pt-PT': 'por',
  'pt-BR': 'por',
  
  // Italian variants
  'it': 'ita',
  'it-IT': 'ita',
  'it-CH': 'ita',
  
  // Chinese variants
  'zh': 'chi_sim',
  'zh-CN': 'chi_sim',
  'zh-Hans': 'chi_sim',
  'zh-TW': 'chi_tra',
  'zh-HK': 'chi_tra',
  'zh-Hant': 'chi_tra',
  'zh-BO': 'bod',
  
  // Japanese
  'ja': 'jpn',
  'ja-JP': 'jpn',
  
  // Korean
  'ko': 'kor',
  'ko-KR': 'kor',
  
  // Russian variants
  'ru': 'rus',
  'ru-RU': 'rus',
  
  // Arabic variants
  'ar': 'ara',
  'ar-SA': 'ara',
  'ar-EG': 'ara',
  'ar-AE': 'ara',
  'ar-MA': 'ara',
  
  // Dutch variants
  'nl': 'nld',
  'nl-NL': 'nld',
  'nl-BE': 'nld',
  
  // Polish
  'pl': 'pol',
  'pl-PL': 'pol',
  
  // Czech
  'cs': 'ces',
  'cs-CZ': 'ces',
  
  // Slovak
  'sk': 'slk',
  'sk-SK': 'slk',
  
  // Hungarian
  'hu': 'hun',
  'hu-HU': 'hun',
  
  // Romanian
  'ro': 'ron',
  'ro-RO': 'ron',
  
  // Bulgarian
  'bg': 'bul',
  'bg-BG': 'bul',
  
  // Croatian
  'hr': 'hrv',
  'hr-HR': 'hrv',
  
  // Serbian
  'sr': 'srp',
  'sr-RS': 'srp',
  'sr-Latn': 'srp_latn',
  
  // Slovenian
  'sl': 'slv',
  'sl-SI': 'slv',
  
  // Estonian
  'et': 'est',
  'et-EE': 'est',
  
  // Latvian
  'lv': 'lav',
  'lv-LV': 'lav',
  
  // Lithuanian
  'lt': 'lit',
  'lt-LT': 'lit',
  
  // Finnish
  'fi': 'fin',
  'fi-FI': 'fin',
  
  // Swedish
  'sv': 'swe',
  'sv-SE': 'swe',
  
  // Norwegian
  'no': 'nor',
  'nb': 'nor',
  'nn': 'nor',
  'no-NO': 'nor',
  'nb-NO': 'nor',
  'nn-NO': 'nor',
  
  // Danish
  'da': 'dan',
  'da-DK': 'dan',
  
  // Icelandic
  'is': 'isl',
  'is-IS': 'isl',
  
  // Greek
  'el': 'ell',
  'el-GR': 'ell',
  
  // Turkish
  'tr': 'tur',
  'tr-TR': 'tur',
  
  // Hebrew
  'he': 'heb',
  'he-IL': 'heb',
  
  // Hindi
  'hi': 'hin',
  'hi-IN': 'hin',
  
  // Thai
  'th': 'tha',
  'th-TH': 'tha',
  
  // Vietnamese
  'vi': 'vie',
  'vi-VN': 'vie',
  
  // Indonesian
  'id': 'ind',
  'id-ID': 'ind',
  
  // Malay
  'ms': 'msa',
  'ms-MY': 'msa',
  
  // Filipino/Tagalog
  'fil': 'fil',
  'tl': 'tgl',
  
  // Ukrainian
  'uk': 'ukr',
  'uk-UA': 'ukr',
  
  // Belarusian
  'be': 'bel',
  'be-BY': 'bel',
  
  // Kazakh
  'kk': 'kaz',
  'kk-KZ': 'kaz',
  
  // Uzbek
  'uz': 'uzb',
  'uz-UZ': 'uzb',
  
  // Georgian
  'ka': 'kat',
  'ka-GE': 'kat',
  
  // Armenian
  'hy': 'hye',
  'hy-AM': 'hye',
  
  // Azerbaijani
  'az': 'aze',
  'az-AZ': 'aze',
  
  // Persian/Farsi
  'fa': 'fas',
  'fa-IR': 'fas',
  
  // Urdu
  'ur': 'urd',
  'ur-PK': 'urd',
  
  // Bengali
  'bn': 'ben',
  'bn-BD': 'ben',
  'bn-IN': 'ben',
  
  // Tamil
  'ta': 'tam',
  'ta-IN': 'tam',
  'ta-LK': 'tam',
  
  // Telugu
  'te': 'tel',
  'te-IN': 'tel',
  
  // Kannada
  'kn': 'kan',
  'kn-IN': 'kan',
  
  // Malayalam
  'ml': 'mal',
  'ml-IN': 'mal',
  
  // Gujarati
  'gu': 'guj',
  'gu-IN': 'guj',
  
  // Marathi
  'mr': 'mar',
  'mr-IN': 'mar',
  
  // Punjabi
  'pa': 'pan',
  'pa-IN': 'pan',
  
  // Nepali
  'ne': 'nep',
  'ne-NP': 'nep',
  
  // Sinhala
  'si': 'sin',
  'si-LK': 'sin',
  
  // Burmese
  'my': 'mya',
  'my-MM': 'mya',
  
  // Khmer
  'km': 'khm',
  'km-KH': 'khm',
  
  // Lao
  'lo': 'lao',
  'lo-LA': 'lao',
  
  // Mongolian
  'mn': 'mon',
  'mn-MN': 'mon',
  
  // Welsh
  'cy': 'cym',
  'cy-GB': 'cym',
  
  // Irish
  'ga': 'gle',
  'ga-IE': 'gle',
  
  // Scottish Gaelic
  'gd': 'gla',
  'gd-GB': 'gla',
  
  // Basque
  'eu': 'eus',
  'eu-ES': 'eus',
  
  // Catalan
  'ca': 'cat',
  'ca-ES': 'cat',
  
  // Galician
  'gl': 'glg',
  'gl-ES': 'glg',
  
  // Macedonian
  'mk': 'mkd',
  'mk-MK': 'mkd',
  
  // Albanian
  'sq': 'sqi',
  'sq-AL': 'sqi',
  
  // Maltese
  'mt': 'mlt',
  'mt-MT': 'mlt',
  
  // Afrikaans
  'af': 'afr',
  'af-ZA': 'afr',
  
  // Swahili
  'sw': 'swa',
  'sw-KE': 'swa',
  'sw-TZ': 'swa',
};

/**
 * Maps a browser language code to an OCR language code
 * Handles exact matches and similar language fallbacks
 * 
 * @param browserLanguage - The browser language code (e.g., 'en-GB', 'fr-FR')
 * @returns OCR language code if found, null if no match
 */
export function mapBrowserLanguageToOcr(browserLanguage: string): string | null {
  if (!browserLanguage) return null;
  
  // Normalize the input
  const normalizedInput = browserLanguage.toLowerCase().replace('_', '-');
  
  // Try exact match first
  const exactMatch = browserToOcrMapping[normalizedInput];
  if (exactMatch) return exactMatch;
  
  // Try with different casing variations
  const variations = [
    browserLanguage,
    browserLanguage.toLowerCase(),
    browserLanguage.toUpperCase(),
    normalizedInput,
  ];
  
  for (const variant of variations) {
    const match = browserToOcrMapping[variant];
    if (match) return match;
  }
  
  // Try base language code (e.g., 'en' from 'en-GB')
  const baseLanguage = normalizedInput.split('-')[0];
  const baseMatch = browserToOcrMapping[baseLanguage];
  if (baseMatch) return baseMatch;
  
  // No match found
  return null;
}

/**
 * Gets the OCR language code for the current browser language
 * 
 * @param currentLanguage - Current i18n language
 * @returns OCR language code array (empty if no match)
 */
export function getAutoOcrLanguage(currentLanguage: string): string[] {
  const ocrLanguage = mapBrowserLanguageToOcr(currentLanguage);
  return ocrLanguage ? [ocrLanguage] : [];
} 