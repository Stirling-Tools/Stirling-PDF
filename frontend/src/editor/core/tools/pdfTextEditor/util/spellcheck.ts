import { useSyncExternalStore } from "react";

// The browser's own spell-check engine does the checking; this module only
// owns the preference (on/off + dictionary language) that drives it.

/** BCP-47 tag, or `SPELLCHECK_AUTO` to follow the document language. */
export type SpellcheckLang = string;

export interface SpellcheckPreference {
  enabled: boolean;
  lang: SpellcheckLang;
}

export interface SpellcheckLanguage {
  /** BCP-47 tag handed to the browser as the `lang` attribute. */
  tag: string;
  /** English name; the UI localises it via Intl.DisplayNames when it can. */
  label: string;
}

export const SPELLCHECK_AUTO = "auto";

export const SPELLCHECK_LANGUAGES: readonly SpellcheckLanguage[] = [
  { tag: "en-US", label: "English (United States)" },
  { tag: "en-GB", label: "English (United Kingdom)" },
  { tag: "de", label: "German" },
  { tag: "fr", label: "French" },
  { tag: "es", label: "Spanish" },
  { tag: "it", label: "Italian" },
  { tag: "pt", label: "Portuguese" },
  { tag: "ar", label: "Arabic" },
  { tag: "hi", label: "Hindi" },
];

// Off by default: an unfocused overlay renders its text transparent, so
// stray squiggles would sit over the PDFium bitmap with nothing under them.
export const DEFAULT_SPELLCHECK_PREFERENCE: SpellcheckPreference =
  Object.freeze({
    enabled: false,
    lang: SPELLCHECK_AUTO,
  });

const STORAGE_KEY = "stirling.pdfTextEditor.spellcheck";

// Deliberately loose: enough to reject junk ("not a tag", "") without
// re-implementing BCP-47, which the browser validates anyway.
const TAG_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    /* localStorage may be absent or throw on access (blocked cookies) */
    return null;
  }
}

function readStored(): SpellcheckPreference | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    /* quota / privacy modes can throw on read */
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const lang =
      typeof record.lang === "string" && record.lang.trim()
        ? record.lang.trim()
        : DEFAULT_SPELLCHECK_PREFERENCE.lang;
    return {
      enabled:
        typeof record.enabled === "boolean"
          ? record.enabled
          : DEFAULT_SPELLCHECK_PREFERENCE.enabled,
      lang,
    };
  } catch {
    /* corrupted entry - fall back to the default rather than crash */
    return null;
  }
}

function writeStored(pref: SpellcheckPreference): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* best-effort: the in-memory value still applies for this session */
  }
}

/** Module singleton so both React roots observe one preference. */
class SpellcheckStore {
  private pref: SpellcheckPreference | null = null;
  private listeners: Set<(p: SpellcheckPreference) => void> = new Set();

  get(): SpellcheckPreference {
    if (!this.pref)
      this.pref = readStored() ?? { ...DEFAULT_SPELLCHECK_PREFERENCE };
    return this.pref;
  }

  set(next: SpellcheckPreference): void {
    const current = this.get();
    const value: SpellcheckPreference = {
      enabled: next.enabled,
      lang: next.lang.trim() || SPELLCHECK_AUTO,
    };
    if (value.enabled === current.enabled && value.lang === current.lang)
      return;
    this.pref = value;
    writeStored(value);
    this.notify(value);
  }

  subscribe(listener: (p: SpellcheckPreference) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.pref = null;
    this.listeners.clear();
  }

  private notify(value: SpellcheckPreference): void {
    // Snapshot + guard: a subscriber may unsubscribe others or throw;
    // iterating the live Set would skip listeners or abort early.
    for (const l of Array.from(this.listeners)) {
      try {
        l(value);
      } catch {
        /* one listener throwing must not stop the rest */
      }
    }
  }
}

const store = new SpellcheckStore();

export function getSpellcheckPreference(): SpellcheckPreference {
  return store.get();
}

export function setSpellcheckPreference(next: SpellcheckPreference): void {
  store.set(next);
}

export function setSpellcheckEnabled(enabled: boolean): void {
  store.set({ ...store.get(), enabled });
}

export function setSpellcheckLang(lang: SpellcheckLang): void {
  store.set({ ...store.get(), lang });
}

export function subscribeSpellcheck(
  listener: (p: SpellcheckPreference) => void,
): () => void {
  return store.subscribe(listener);
}

/** Test-only - drop the cached preference and every subscriber. */
export function __resetSpellcheckForTests(): void {
  store.reset();
}

function normalizeTag(tag: string | null | undefined): string | null {
  if (typeof tag !== "string") return null;
  const trimmed = tag.trim();
  return TAG_PATTERN.test(trimmed) ? trimmed : null;
}

/** The `lang` for an editable overlay, or null to leave it to the browser. */
export function resolveLang(
  pref: SpellcheckPreference,
  documentLang: string | null | undefined,
): string | null {
  if (!pref.enabled) return null;
  if (pref.lang !== SPELLCHECK_AUTO) return normalizeTag(pref.lang);
  return normalizeTag(documentLang);
}

export function useSpellcheckPreference(): SpellcheckPreference {
  return useSyncExternalStore(
    subscribeSpellcheck,
    getSpellcheckPreference,
    getSpellcheckPreference,
  );
}
