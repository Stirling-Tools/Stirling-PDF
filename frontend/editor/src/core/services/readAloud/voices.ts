export interface ReadAloudLanguageOption {
  /** Region-free ISO 639-1 code shared by every voice in the group. */
  value: string;
  label: string;
  voices: SpeechSynthesisVoice[];
}

/**
 * Old and alternate ISO codes browsers still emit for voices. Detection uses
 * modern codes, so both sides have to meet in the middle before a voice can be
 * matched to a document.
 */
const LANGUAGE_ALIASES: Record<string, readonly string[]> = {
  no: ["nb", "nn"],
  he: ["iw"],
  id: ["in"],
  yi: ["ji"],
  zh: ["cmn"],
};

const DEFAULT_REGION: Record<string, string> = {
  ar: "ar-SA",
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  nl: "nl-NL",
  pl: "pl-PL",
  pt: "pt-BR",
  ru: "ru-RU",
  sv: "sv-SE",
  tr: "tr-TR",
  uk: "uk-UA",
  zh: "zh-CN",
};

/** Base language of a BCP 47 tag, tolerating the underscore form some voices use. */
export function baseLanguage(language: string): string {
  return language.toLowerCase().replace(/_/g, "-").split("-")[0] ?? language;
}

export function voiceMatchesLanguage(
  voice: SpeechSynthesisVoice,
  language: string,
): boolean {
  const wanted = baseLanguage(language);
  const actual = baseLanguage(voice.lang);
  return (
    actual === wanted || (LANGUAGE_ALIASES[wanted]?.includes(actual) ?? false)
  );
}

/**
 * Display name for a language code in the reader's own language.
 *
 * `Intl.DisplayNames` is unavailable in a few older embedded webviews, so the
 * raw code is the fallback rather than an empty label.
 */
export function languageDisplayName(code: string, uiLanguage: string): string {
  try {
    const names = new Intl.DisplayNames([uiLanguage], { type: "language" });
    const name = names.of(code);
    return name && name !== code ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Best installed voice for a language, or null when the device has none.
 *
 * Returning null is deliberate: speaking Spanish text with an English voice
 * sounds broken and hides the install problem. The player asks the user to pick
 * a voice instead.
 */
export function resolveVoiceForLanguage(
  language: string,
  voices: readonly SpeechSynthesisVoice[],
  preferredVoiceURI?: string,
  preferredLanguageTag?: string,
): SpeechSynthesisVoice | null {
  const candidates = voices.filter((voice) =>
    voiceMatchesLanguage(voice, language),
  );
  if (candidates.length === 0) return null;

  if (preferredVoiceURI) {
    const preferred = candidates.find(
      (voice) => voice.voiceURI === preferredVoiceURI,
    );
    if (preferred) return preferred;
  }

  const wanted = baseLanguage(language);
  const preferredTag = preferredLanguageTag
    ? preferredLanguageTag.toLowerCase()
    : null;
  const fallbackTag = DEFAULT_REGION[wanted]?.toLowerCase() ?? null;

  const tag = (voice: SpeechSynthesisVoice) =>
    voice.lang.toLowerCase().replace(/_/g, "-");

  return [...candidates].sort((a, b) => {
    if (preferredTag != null) {
      const aPreferred = tag(a) === preferredTag ? 1 : 0;
      const bPreferred = tag(b) === preferredTag ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    }
    if (fallbackTag != null) {
      const aFallback = tag(a) === fallbackTag ? 1 : 0;
      const bFallback = tag(b) === fallbackTag ? 1 : 0;
      if (aFallback !== bFallback) return bFallback - aFallback;
    }
    if (a.default !== b.default) return a.default ? -1 : 1;
    if (a.localService !== b.localService) return a.localService ? -1 : 1;
    const aLang = tag(a);
    const bLang = tag(b);
    if (aLang !== bLang) return aLang.localeCompare(bLang);
    return a.name.localeCompare(b.name);
  })[0];
}

/** Every voice for one language, deduplicated and in a stable presentation order. */
export function voicesForLanguage(
  language: string,
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
  const seen = new Set<string>();
  return voices
    .filter((voice) => voiceMatchesLanguage(voice, language))
    .filter((voice) => {
      const key = `${voice.voiceURI}\u0000${voice.lang}\u0000${voice.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aLang = a.lang.toLowerCase();
      const bLang = b.lang.toLowerCase();
      if (aLang !== bLang) return aLang.localeCompare(bLang);
      if (a.default !== b.default) return a.default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Languages that actually have a voice installed, labelled for the current UI. */
export function groupVoicesByLanguage(
  voices: readonly SpeechSynthesisVoice[],
  uiLanguage: string,
): ReadAloudLanguageOption[] {
  const groups = new Map<string, SpeechSynthesisVoice[]>();
  for (const voice of voices) {
    const base = baseLanguage(voice.lang);
    if (!/^[a-z]{2,3}$/.test(base)) continue;
    const existing = groups.get(base);
    if (existing) existing.push(voice);
    else groups.set(base, [voice]);
  }
  return [...groups.entries()]
    .map(([value, groupVoices]) => ({
      value,
      label: languageDisplayName(value, uiLanguage),
      voices: voicesForLanguage(value, groupVoices),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function voiceDisplayName(voice: SpeechSynthesisVoice): string {
  return `${voice.name} (${voice.lang})`;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
