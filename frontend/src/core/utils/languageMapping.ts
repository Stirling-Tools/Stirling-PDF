// Unified Language System - Tri-directional mapping between browser languages, OCR codes, and display names
// Replaces both languageMapping.ts and tempOcrLanguages.ts

interface LanguageDefinition {
  ocrCode: string;
  displayName: string;
  browserCodes: string[];
}

// Comprehensive language definitions with all mappings
const languageDefinitions: LanguageDefinition[] = [
  // English
  {
    ocrCode: 'eng',
    displayName: 'English',
    browserCodes: ['en', 'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IE', 'en-NZ', 'en-ZA']
  },
  
  // Spanish
  {
    ocrCode: 'spa',
    displayName: 'Spanish',
    browserCodes: ['es', 'es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-CL', 'es-PE', 'es-VE']
  },
  
  // French
  {
    ocrCode: 'fra',
    displayName: 'French',
    browserCodes: ['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH']
  },
  
  // German
  {
    ocrCode: 'deu',
    displayName: 'German',
    browserCodes: ['de', 'de-DE', 'de-AT', 'de-CH']
  },
  
  // Portuguese
  {
    ocrCode: 'por',
    displayName: 'Portuguese',
    browserCodes: ['pt', 'pt-PT', 'pt-BR']
  },
  
  // Italian
  {
    ocrCode: 'ita',
    displayName: 'Italian',
    browserCodes: ['it', 'it-IT', 'it-CH']
  },
  
  // Chinese Simplified
  {
    ocrCode: 'chi_sim',
    displayName: 'Chinese (Simplified)',
    browserCodes: ['zh', 'zh-CN', 'zh-Hans']
  },
  
  // Chinese Traditional
  {
    ocrCode: 'chi_tra',
    displayName: 'Chinese (Traditional)',
    browserCodes: ['zh-TW', 'zh-HK', 'zh-Hant']
  },
  
  // Tibetan
  {
    ocrCode: 'bod',
    displayName: 'Tibetan',
    browserCodes: ['bo', 'zh-BO']
  },
  
  // Japanese
  {
    ocrCode: 'jpn',
    displayName: 'Japanese',
    browserCodes: ['ja', 'ja-JP']
  },
  
  // Korean
  {
    ocrCode: 'kor',
    displayName: 'Korean',
    browserCodes: ['ko', 'ko-KR']
  },
  
  // Russian
  {
    ocrCode: 'rus',
    displayName: 'Russian',
    browserCodes: ['ru', 'ru-RU']
  },
  
  // Arabic
  {
    ocrCode: 'ara',
    displayName: 'Arabic',
    browserCodes: ['ar', 'ar-SA', 'ar-EG', 'ar-AE', 'ar-MA']
  },
  
  // Dutch
  {
    ocrCode: 'nld',
    displayName: 'Dutch; Flemish',
    browserCodes: ['nl', 'nl-NL', 'nl-BE']
  },
  
  // Polish
  {
    ocrCode: 'pol',
    displayName: 'Polish',
    browserCodes: ['pl', 'pl-PL']
  },
  
  // Czech
  {
    ocrCode: 'ces',
    displayName: 'Czech',
    browserCodes: ['cs', 'cs-CZ']
  },
  
  // Slovak
  {
    ocrCode: 'slk',
    displayName: 'Slovak',
    browserCodes: ['sk', 'sk-SK']
  },
  
  // Hungarian
  {
    ocrCode: 'hun',
    displayName: 'Hungarian',
    browserCodes: ['hu', 'hu-HU']
  },
  
  // Romanian
  {
    ocrCode: 'ron',
    displayName: 'Romanian, Moldavian, Moldovan',
    browserCodes: ['ro', 'ro-RO']
  },
  
  // Bulgarian
  {
    ocrCode: 'bul',
    displayName: 'Bulgarian',
    browserCodes: ['bg', 'bg-BG']
  },
  
  // Croatian
  {
    ocrCode: 'hrv',
    displayName: 'Croatian',
    browserCodes: ['hr', 'hr-HR']
  },
  
  // Serbian
  {
    ocrCode: 'srp',
    displayName: 'Serbian',
    browserCodes: ['sr', 'sr-RS']
  },
  
  // Serbian Latin
  {
    ocrCode: 'srp_latn',
    displayName: 'Serbian (Latin)',
    browserCodes: ['sr-Latn']
  },
  
  // Slovenian
  {
    ocrCode: 'slv',
    displayName: 'Slovenian',
    browserCodes: ['sl', 'sl-SI']
  },
  
  // Estonian
  {
    ocrCode: 'est',
    displayName: 'Estonian',
    browserCodes: ['et', 'et-EE']
  },
  
  // Latvian
  {
    ocrCode: 'lav',
    displayName: 'Latvian',
    browserCodes: ['lv', 'lv-LV']
  },
  
  // Lithuanian
  {
    ocrCode: 'lit',
    displayName: 'Lithuanian',
    browserCodes: ['lt', 'lt-LT']
  },
  
  // Finnish
  {
    ocrCode: 'fin',
    displayName: 'Finnish',
    browserCodes: ['fi', 'fi-FI']
  },
  
  // Swedish
  {
    ocrCode: 'swe',
    displayName: 'Swedish',
    browserCodes: ['sv', 'sv-SE']
  },
  
  // Norwegian
  {
    ocrCode: 'nor',
    displayName: 'Norwegian',
    browserCodes: ['no', 'nb', 'nn', 'no-NO', 'nb-NO', 'nn-NO']
  },
  
  // Danish
  {
    ocrCode: 'dan',
    displayName: 'Danish',
    browserCodes: ['da', 'da-DK']
  },
  
  // Icelandic
  {
    ocrCode: 'isl',
    displayName: 'Icelandic',
    browserCodes: ['is', 'is-IS']
  },
  
  // Greek
  {
    ocrCode: 'ell',
    displayName: 'Greek',
    browserCodes: ['el', 'el-GR']
  },
  
  // Turkish
  {
    ocrCode: 'tur',
    displayName: 'Turkish',
    browserCodes: ['tr', 'tr-TR']
  },
  
  // Hebrew
  {
    ocrCode: 'heb',
    displayName: 'Hebrew',
    browserCodes: ['he', 'he-IL']
  },
  
  // Hindi
  {
    ocrCode: 'hin',
    displayName: 'Hindi',
    browserCodes: ['hi', 'hi-IN']
  },
  
  // Thai
  {
    ocrCode: 'tha',
    displayName: 'Thai',
    browserCodes: ['th', 'th-TH']
  },
  
  // Vietnamese
  {
    ocrCode: 'vie',
    displayName: 'Vietnamese',
    browserCodes: ['vi', 'vi-VN']
  },
  
  // Indonesian
  {
    ocrCode: 'ind',
    displayName: 'Indonesian',
    browserCodes: ['id', 'id-ID']
  },
  
  // Malay
  {
    ocrCode: 'msa',
    displayName: 'Malay',
    browserCodes: ['ms', 'ms-MY']
  },
  
  // Filipino
  {
    ocrCode: 'fil',
    displayName: 'Filipino',
    browserCodes: ['fil']
  },
  
  // Tagalog
  {
    ocrCode: 'tgl',
    displayName: 'Tagalog',
    browserCodes: ['tl']
  },
  
  // Ukrainian
  {
    ocrCode: 'ukr',
    displayName: 'Ukrainian',
    browserCodes: ['uk', 'uk-UA']
  },
  
  // Belarusian
  {
    ocrCode: 'bel',
    displayName: 'Belarusian',
    browserCodes: ['be', 'be-BY']
  },
  
  // Kazakh
  {
    ocrCode: 'kaz',
    displayName: 'Kazakh',
    browserCodes: ['kk', 'kk-KZ']
  },
  
  // Uzbek
  {
    ocrCode: 'uzb',
    displayName: 'Uzbek',
    browserCodes: ['uz', 'uz-UZ']
  },
  
  // Georgian
  {
    ocrCode: 'kat',
    displayName: 'Georgian',
    browserCodes: ['ka', 'ka-GE']
  },
  
  // Armenian
  {
    ocrCode: 'hye',
    displayName: 'Armenian',
    browserCodes: ['hy', 'hy-AM']
  },
  
  // Azerbaijani
  {
    ocrCode: 'aze',
    displayName: 'Azerbaijani',
    browserCodes: ['az', 'az-AZ']
  },
  
  // Persian/Farsi
  {
    ocrCode: 'fas',
    displayName: 'Persian',
    browserCodes: ['fa', 'fa-IR']
  },
  
  // Urdu
  {
    ocrCode: 'urd',
    displayName: 'Urdu',
    browserCodes: ['ur', 'ur-PK']
  },
  
  // Bengali
  {
    ocrCode: 'ben',
    displayName: 'Bengali',
    browserCodes: ['bn', 'bn-BD', 'bn-IN']
  },
  
  // Tamil
  {
    ocrCode: 'tam',
    displayName: 'Tamil',
    browserCodes: ['ta', 'ta-IN', 'ta-LK']
  },
  
  // Telugu
  {
    ocrCode: 'tel',
    displayName: 'Telugu',
    browserCodes: ['te', 'te-IN']
  },
  
  // Kannada
  {
    ocrCode: 'kan',
    displayName: 'Kannada',
    browserCodes: ['kn', 'kn-IN']
  },
  
  // Malayalam
  {
    ocrCode: 'mal',
    displayName: 'Malayalam',
    browserCodes: ['ml', 'ml-IN']
  },
  
  // Gujarati
  {
    ocrCode: 'guj',
    displayName: 'Gujarati',
    browserCodes: ['gu', 'gu-IN']
  },
  
  // Marathi
  {
    ocrCode: 'mar',
    displayName: 'Marathi',
    browserCodes: ['mr', 'mr-IN']
  },
  
  // Punjabi
  {
    ocrCode: 'pan',
    displayName: 'Panjabi, Punjabi',
    browserCodes: ['pa', 'pa-IN']
  },
  
  // Nepali
  {
    ocrCode: 'nep',
    displayName: 'Nepali',
    browserCodes: ['ne', 'ne-NP']
  },
  
  // Sinhala
  {
    ocrCode: 'sin',
    displayName: 'Sinhala, Sinhalese',
    browserCodes: ['si', 'si-LK']
  },
  
  // Burmese
  {
    ocrCode: 'mya',
    displayName: 'Burmese',
    browserCodes: ['my', 'my-MM']
  },
  
  // Khmer
  {
    ocrCode: 'khm',
    displayName: 'Central Khmer',
    browserCodes: ['km', 'km-KH']
  },
  
  // Lao
  {
    ocrCode: 'lao',
    displayName: 'Lao',
    browserCodes: ['lo', 'lo-LA']
  },
  
  // Mongolian
  {
    ocrCode: 'mon',
    displayName: 'Mongolian',
    browserCodes: ['mn', 'mn-MN']
  },
  
  // Welsh
  {
    ocrCode: 'cym',
    displayName: 'Welsh',
    browserCodes: ['cy', 'cy-GB']
  },
  
  // Irish
  {
    ocrCode: 'gle',
    displayName: 'Irish',
    browserCodes: ['ga', 'ga-IE']
  },
  
  // Scottish Gaelic
  {
    ocrCode: 'gla',
    displayName: 'Scottish Gaelic',
    browserCodes: ['gd', 'gd-GB']
  },
  
  // Basque
  {
    ocrCode: 'eus',
    displayName: 'Basque',
    browserCodes: ['eu', 'eu-ES']
  },
  
  // Catalan
  {
    ocrCode: 'cat',
    displayName: 'Catalan',
    browserCodes: ['ca', 'ca-ES']
  },
  
  // Galician
  {
    ocrCode: 'glg',
    displayName: 'Galician',
    browserCodes: ['gl', 'gl-ES']
  },
  
  // Macedonian
  {
    ocrCode: 'mkd',
    displayName: 'Macedonian',
    browserCodes: ['mk', 'mk-MK']
  },
  
  // Albanian
  {
    ocrCode: 'sqi',
    displayName: 'Albanian',
    browserCodes: ['sq', 'sq-AL']
  },
  
  // Maltese
  {
    ocrCode: 'mlt',
    displayName: 'Maltese',
    browserCodes: ['mt', 'mt-MT']
  },
  
  // Afrikaans
  {
    ocrCode: 'afr',
    displayName: 'Afrikaans',
    browserCodes: ['af', 'af-ZA']
  },
  
  // Swahili
  {
    ocrCode: 'swa',
    displayName: 'Swahili',
    browserCodes: ['sw', 'sw-KE', 'sw-TZ']
  },

  // Amharic
  {
    ocrCode: 'amh',
    displayName: 'Amharic',
    browserCodes: ['am']
  },
  
  // Assamese
  {
    ocrCode: 'asm',
    displayName: 'Assamese',
    browserCodes: ['as']
  },
  
  // Azerbaijani (Cyrillic)
  {
    ocrCode: 'aze_cyrl',
    displayName: 'Azerbaijani (Cyrillic)',
    browserCodes: []
  },
  
  // Bosnian
  {
    ocrCode: 'bos',
    displayName: 'Bosnian',
    browserCodes: ['bs']
  },
  
  // Breton
  {
    ocrCode: 'bre',
    displayName: 'Breton',
    browserCodes: ['br']
  },
  
  // Bambara
  {
    ocrCode: 'bam',
    displayName: 'Bambara',
    browserCodes: ['bm']
  },
  
  // Bashkir
  {
    ocrCode: 'bak',
    displayName: 'Bashkir',
    browserCodes: ['ba']
  },
  
  // Cornish
  {
    ocrCode: 'cor',
    displayName: 'Cornish',
    browserCodes: ['kw']
  },
  
  // Corsican
  {
    ocrCode: 'cos',
    displayName: 'Corsican',
    browserCodes: ['co']
  },
  
  // Ewe
  {
    ocrCode: 'ewe',
    displayName: 'Ewe',
    browserCodes: ['ee']
  },
  
  // Faroese
  {
    ocrCode: 'fao',
    displayName: 'Faroese',
    browserCodes: ['fo']
  },
  
  // Fijian
  {
    ocrCode: 'fij',
    displayName: 'Fijian',
    browserCodes: ['fj']
  },
  
  // Haitian Creole
  {
    ocrCode: 'hat',
    displayName: 'Haitian, Haitian Creole',
    browserCodes: ['ht']
  },
  
  // Javanese
  {
    ocrCode: 'jav',
    displayName: 'Javanese',
    browserCodes: ['jv']
  },
  
  // Kirghiz
  {
    ocrCode: 'kir',
    displayName: 'Kirghiz, Kyrgyz',
    browserCodes: ['ky']
  },
  
  // Quechua
  {
    ocrCode: 'que',
    displayName: 'Quechua',
    browserCodes: ['qu']
  },
  
  // Sindhi
  {
    ocrCode: 'snd',
    displayName: 'Sindhi',
    browserCodes: ['sd']
  },
  
  // Yiddish
  {
    ocrCode: 'yid',
    displayName: 'Yiddish',
    browserCodes: ['yi']
  },
  
  // Yoruba
  {
    ocrCode: 'yor',
    displayName: 'Yoruba',
    browserCodes: ['yo']
  },

  // Additional OCR languages without browser mappings or with very specific/rare codes
  {
    ocrCode: 'ceb',
    displayName: 'Cebuano',
    browserCodes: []
  },
  {
    ocrCode: 'chi_sim_vert',
    displayName: 'Chinese (Simplified, Vertical)',
    browserCodes: []
  },
  {
    ocrCode: 'chi_tra_vert',
    displayName: 'Chinese (Traditional, Vertical)',
    browserCodes: []
  },
  {
    ocrCode: 'chr',
    displayName: 'Cherokee',
    browserCodes: []
  },
  {
    ocrCode: 'dan_frak',
    displayName: 'Danish (Fraktur)',
    browserCodes: []
  },
  {
    ocrCode: 'deu_frak',
    displayName: 'German (Fraktur)',
    browserCodes: []
  },
  {
    ocrCode: 'div',
    displayName: 'Divehi',
    browserCodes: ['dv']
  },
  {
    ocrCode: 'dzo',
    displayName: 'Dzongkha',
    browserCodes: ['dz']
  },
  {
    ocrCode: 'enm',
    displayName: 'English, Middle (1100-1500)',
    browserCodes: []
  },
  {
    ocrCode: 'epo',
    displayName: 'Esperanto',
    browserCodes: ['eo']
  },
  {
    ocrCode: 'equ',
    displayName: 'Math / equation detection module',
    browserCodes: []
  },
  {
    ocrCode: 'frk',
    displayName: 'Frankish',
    browserCodes: []
  },
  {
    ocrCode: 'frm',
    displayName: 'French, Middle (ca.1400-1600)',
    browserCodes: []
  },
  {
    ocrCode: 'fry',
    displayName: 'Western Frisian',
    browserCodes: ['fy']
  },
  {
    ocrCode: 'grc',
    displayName: 'Ancient Greek',
    browserCodes: []
  },
  {
    ocrCode: 'iku',
    displayName: 'Inuktitut',
    browserCodes: ['iu']
  },
  {
    ocrCode: 'ita_old',
    displayName: 'Italian (Old)',
    browserCodes: []
  },
  {
    ocrCode: 'jpn_vert',
    displayName: 'Japanese (Vertical)',
    browserCodes: []
  },
  {
    ocrCode: 'kat_old',
    displayName: 'Georgian (Old)',
    browserCodes: []
  },
  {
    ocrCode: 'kmr',
    displayName: 'Northern Kurdish',
    browserCodes: ['ku']
  },
  {
    ocrCode: 'kor_vert',
    displayName: 'Korean (Vertical)',
    browserCodes: []
  },
  {
    ocrCode: 'lat',
    displayName: 'Latin',
    browserCodes: ['la']
  },
  {
    ocrCode: 'ltz',
    displayName: 'Luxembourgish',
    browserCodes: ['lb']
  },
  {
    ocrCode: 'mri',
    displayName: 'Maori',
    browserCodes: ['mi']
  },
  {
    ocrCode: 'oci',
    displayName: 'Occitan (post 1500)',
    browserCodes: ['oc']
  },
  {
    ocrCode: 'ori',
    displayName: 'Oriya',
    browserCodes: ['or']
  },
  {
    ocrCode: 'osd',
    displayName: 'Orientation and script detection module',
    browserCodes: []
  },
  {
    ocrCode: 'pus',
    displayName: 'Pushto, Pashto',
    browserCodes: ['ps']
  },
  {
    ocrCode: 'san',
    displayName: 'Sanskrit',
    browserCodes: ['sa']
  },
  {
    ocrCode: 'slk_frak',
    displayName: 'Slovak (Fraktur)',
    browserCodes: []
  },
  {
    ocrCode: 'spa_old',
    displayName: 'Spanish (Old)',
    browserCodes: []
  },
  {
    ocrCode: 'sun',
    displayName: 'Sundanese',
    browserCodes: ['su']
  },
  {
    ocrCode: 'syr',
    displayName: 'Syriac',
    browserCodes: []
  },
  {
    ocrCode: 'tat',
    displayName: 'Tatar',
    browserCodes: ['tt']
  },
  {
    ocrCode: 'tgk',
    displayName: 'Tajik',
    browserCodes: ['tg']
  },
  {
    ocrCode: 'tir',
    displayName: 'Tigrinya',
    browserCodes: ['ti']
  },
  {
    ocrCode: 'ton',
    displayName: 'Tonga (Tonga Islands)',
    browserCodes: ['to']
  },
  {
    ocrCode: 'uig',
    displayName: 'Uighur, Uyghur',
    browserCodes: ['ug']
  },
  {
    ocrCode: 'uzb_cyrl',
    displayName: 'Uzbek (Cyrillic)',
    browserCodes: []
  }
];

// Build lookup maps for efficient access
const browserToOcrMap = new Map<string, string>();
const ocrToDisplayMap = new Map<string, string>();
const displayToOcrMap = new Map<string, string>();
const ocrToBrowserMap = new Map<string, string[]>();

// Populate lookup maps
languageDefinitions.forEach(lang => {
  // OCR code to display name
  ocrToDisplayMap.set(lang.ocrCode, lang.displayName);
  
  // Display name to OCR code
  displayToOcrMap.set(lang.displayName.toLowerCase(), lang.ocrCode);
  
  // OCR code to browser codes
  ocrToBrowserMap.set(lang.ocrCode, lang.browserCodes);
  
  // Browser codes to OCR code
  lang.browserCodes.forEach(browserCode => {
    browserToOcrMap.set(browserCode.toLowerCase(), lang.ocrCode);
  });
});

/**
 * Maps a browser language code to an OCR language code
 * Handles exact matches and similar language fallbacks
 * 
 * @param browserLanguage - The browser language code (e.g., 'en-GB', 'fr-FR')
 * @returns OCR language code if found, null if no match
 * 
 * @example
 * mapBrowserLanguageToOcr('de-DE') // Returns 'deu'
 * mapBrowserLanguageToOcr('en-GB') // Returns 'eng'
 * mapBrowserLanguageToOcr('zh-CN') // Returns 'chi_sim'
 */
export function mapBrowserLanguageToOcr(browserLanguage: string): string | null {
  if (!browserLanguage) return null;
  
  // Normalize the input
  const normalizedInput = browserLanguage.toLowerCase().replace('_', '-');
  
  // Try exact match first
  const exactMatch = browserToOcrMap.get(normalizedInput);
  if (exactMatch) return exactMatch;
  
  // Try with different casing variations
  const variations = [
    browserLanguage.toLowerCase(),
    browserLanguage.toUpperCase().toLowerCase(),
    normalizedInput,
  ];
  
  for (const variant of variations) {
    const match = browserToOcrMap.get(variant);
    if (match) return match;
  }
  
  // Try base language code (e.g., 'en' from 'en-GB')
  const baseLanguage = normalizedInput.split('-')[0];
  const baseMatch = browserToOcrMap.get(baseLanguage);
  if (baseMatch) return baseMatch;
  
  // No match found
  return null;
}

/**
 * Gets the display name for an OCR language code
 * 
 * @param ocrCode - The OCR language code (e.g., 'eng', 'deu')
 * @returns Display name if found, the original code if not found
 * 
 * @example
 * getOcrDisplayName('deu') // Returns 'German'
 * getOcrDisplayName('eng') // Returns 'English'
 * getOcrDisplayName('chi_sim') // Returns 'Chinese (Simplified)'
 */
export function getOcrDisplayName(ocrCode: string): string {
  return ocrToDisplayMap.get(ocrCode) || ocrCode;
}

/**
 * Gets the OCR code from a display name
 * 
 * @param displayName - The display name (e.g., 'English', 'German')
 * @returns OCR code if found, null if no match
 * 
 * @example
 * getOcrCodeFromDisplayName('German') // Returns 'deu'
 * getOcrCodeFromDisplayName('English') // Returns 'eng'
 * getOcrCodeFromDisplayName('chinese (simplified)') // Returns 'chi_sim' (case insensitive)
 */
export function getOcrCodeFromDisplayName(displayName: string): string | null {
  return displayToOcrMap.get(displayName.toLowerCase()) || null;
}

/**
 * Gets the browser language codes for an OCR language code
 * 
 * @param ocrCode - The OCR language code (e.g., 'eng', 'deu')
 * @returns Array of browser language codes
 * 
 * @example
 * getBrowserLanguagesForOcr('deu') // Returns ['de', 'de-DE', 'de-AT', 'de-CH']
 * getBrowserLanguagesForOcr('eng') // Returns ['en', 'en-US', 'en-GB', 'en-AU', ...]
 * getBrowserLanguagesForOcr('nor') // Returns ['no', 'nb', 'nn', 'no-NO', 'nb-NO', 'nn-NO']
 */
export function getBrowserLanguagesForOcr(ocrCode: string): string[] {
  return ocrToBrowserMap.get(ocrCode) || [];
}

/**
 * Gets the OCR language code for the current browser language
 * 
 * @param currentLanguage - Current i18n language
 * @returns OCR language code array (empty if no match)
 * 
 * @example
 * getAutoOcrLanguage('de-DE') // Returns ['deu']
 * getAutoOcrLanguage('en-GB') // Returns ['eng'] 
 * getAutoOcrLanguage('unknown') // Returns []
 */
export function getAutoOcrLanguage(currentLanguage: string): string[] {
  const ocrLanguage = mapBrowserLanguageToOcr(currentLanguage);
  return ocrLanguage ? [ocrLanguage] : [];
}

/**
 * Gets all available language definitions
 * 
 * @returns Array of all language definitions
 * 
 * @example
 * const allLanguages = getAllLanguageDefinitions();
 * // Returns: [{ ocrCode: 'eng', displayName: 'English', browserCodes: ['en', 'en-US', ...] }, ...]
 */
export function getAllLanguageDefinitions(): LanguageDefinition[] {
  return [...languageDefinitions];
}

/**
 * Legacy compatibility - provides the same interface as tempOcrLanguages.ts
 */
export const tempOcrLanguages = {
  lang: Object.fromEntries(ocrToDisplayMap)
} as const; 