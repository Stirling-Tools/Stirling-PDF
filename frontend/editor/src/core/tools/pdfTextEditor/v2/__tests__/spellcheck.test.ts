import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_SPELLCHECK_PREFERENCE,
  SPELLCHECK_AUTO,
  SPELLCHECK_LANGUAGES,
  __resetSpellcheckForTests,
  getSpellcheckPreference,
  resolveLang,
  setSpellcheckEnabled,
  setSpellcheckLang,
  setSpellcheckPreference,
  subscribeSpellcheck,
} from "@app/tools/pdfTextEditor/v2/util/spellcheck";

const STORAGE_KEY = "stirling.pdfTextEditorV2.spellcheck";

const realStorage = window.localStorage;

function setStorage(value: Storage | undefined): void {
  (window as unknown as { localStorage: Storage | undefined }).localStorage =
    value;
}

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error("localStorage is blocked");
  };
  return {
    get length(): number {
      return 0;
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage;
}

beforeEach(() => {
  setStorage(realStorage);
  realStorage.clear();
  __resetSpellcheckForTests();
});

afterEach(() => {
  setStorage(realStorage);
  realStorage.clear();
  __resetSpellcheckForTests();
});

describe("spellcheck default state", () => {
  it("is off and automatic with nothing persisted", () => {
    expect(getSpellcheckPreference()).toEqual({
      enabled: false,
      lang: SPELLCHECK_AUTO,
    });
  });

  it("returns a stable snapshot reference until it changes", () => {
    const first = getSpellcheckPreference();
    expect(getSpellcheckPreference()).toBe(first);
    setSpellcheckEnabled(true);
    expect(getSpellcheckPreference()).not.toBe(first);
  });

  it("offers en-US, en-GB and an RTL plus an Indic language", () => {
    const tags = SPELLCHECK_LANGUAGES.map((l) => l.tag);
    expect(tags).toEqual(
      expect.arrayContaining(["en-US", "en-GB", "de", "fr", "es", "ar", "hi"]),
    );
    expect(tags).not.toContain(SPELLCHECK_AUTO);
  });

  it("exposes a frozen default so callers cannot mutate it", () => {
    expect(Object.isFrozen(DEFAULT_SPELLCHECK_PREFERENCE)).toBe(true);
  });
});

describe("spellcheck persistence", () => {
  it("round-trips through localStorage", () => {
    setSpellcheckEnabled(true);
    setSpellcheckLang("de");
    expect(JSON.parse(realStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      enabled: true,
      lang: "de",
    });
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference()).toEqual({ enabled: true, lang: "de" });
  });

  it("trims a padded tag and treats a blank one as automatic", () => {
    setSpellcheckLang("  fr  ");
    expect(getSpellcheckPreference().lang).toBe("fr");
    setSpellcheckLang("   ");
    expect(getSpellcheckPreference().lang).toBe(SPELLCHECK_AUTO);
  });

  it("falls back to the default when the stored JSON is corrupt", () => {
    realStorage.setItem(STORAGE_KEY, "{not json");
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference()).toEqual({
      enabled: false,
      lang: SPELLCHECK_AUTO,
    });
  });

  it("ignores a stored value that is not an object", () => {
    realStorage.setItem(STORAGE_KEY, '"enabled"');
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference().enabled).toBe(false);
  });

  it("keeps the valid half of a partially wrong-typed entry", () => {
    realStorage.setItem(STORAGE_KEY, '{"enabled":true,"lang":7}');
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference()).toEqual({
      enabled: true,
      lang: SPELLCHECK_AUTO,
    });
  });

  it("degrades to memory when localStorage throws", () => {
    setStorage(throwingStorage());
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference().enabled).toBe(false);
    expect(() => setSpellcheckEnabled(true)).not.toThrow();
    expect(getSpellcheckPreference().enabled).toBe(true);
  });

  it("degrades to memory when localStorage is absent", () => {
    setStorage(undefined);
    __resetSpellcheckForTests();
    expect(getSpellcheckPreference()).toEqual({
      enabled: false,
      lang: SPELLCHECK_AUTO,
    });
    expect(() => setSpellcheckLang("es")).not.toThrow();
    expect(getSpellcheckPreference().lang).toBe("es");
  });
});

describe("spellcheck subscribers", () => {
  it("notifies on change and stops after unsubscribe", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeSpellcheck((p) => seen.push(p.enabled));
    setSpellcheckEnabled(true);
    unsubscribe();
    setSpellcheckEnabled(false);
    expect(seen).toEqual([true]);
  });

  it("does not notify when the value is unchanged", () => {
    const listener = vi.fn();
    subscribeSpellcheck(listener);
    setSpellcheckPreference({ enabled: false, lang: SPELLCHECK_AUTO });
    expect(listener).not.toHaveBeenCalled();
    setSpellcheckPreference({ enabled: true, lang: SPELLCHECK_AUTO });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps notifying after one listener throws", () => {
    const later = vi.fn();
    subscribeSpellcheck(() => {
      throw new Error("listener blew up");
    });
    subscribeSpellcheck(later);
    setSpellcheckEnabled(true);
    expect(later).toHaveBeenCalledWith({
      enabled: true,
      lang: SPELLCHECK_AUTO,
    });
  });

  it("survives a listener that unsubscribes another mid-notify", () => {
    const later = vi.fn();
    let unsubscribeLater = () => {};
    subscribeSpellcheck(() => unsubscribeLater());
    unsubscribeLater = subscribeSpellcheck(later);
    setSpellcheckEnabled(true);
    expect(later).toHaveBeenCalledTimes(1);
    setSpellcheckEnabled(false);
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe("resolveLang", () => {
  it("returns null when spell-check is off", () => {
    expect(resolveLang({ enabled: false, lang: "de" }, "fr")).toBeNull();
  });

  it("returns the explicit tag when one is chosen", () => {
    expect(resolveLang({ enabled: true, lang: "en-GB" }, "fr")).toBe("en-GB");
  });

  it("trims an explicit tag", () => {
    expect(resolveLang({ enabled: true, lang: " pt-BR " }, null)).toBe("pt-BR");
  });

  it("rejects an explicit tag that is not BCP-47 shaped", () => {
    expect(resolveLang({ enabled: true, lang: "not a tag" }, "fr")).toBeNull();
  });

  it("falls back to the document language on auto", () => {
    expect(resolveLang({ enabled: true, lang: SPELLCHECK_AUTO }, "hi")).toBe(
      "hi",
    );
  });

  it("returns null on auto with no usable document language", () => {
    const pref = { enabled: true, lang: SPELLCHECK_AUTO };
    expect(resolveLang(pref, null)).toBeNull();
    expect(resolveLang(pref, undefined)).toBeNull();
    expect(resolveLang(pref, "")).toBeNull();
    expect(resolveLang(pref, "   ")).toBeNull();
    expect(resolveLang(pref, "en_US")).toBeNull();
  });

  it("accepts every offered language", () => {
    for (const lang of SPELLCHECK_LANGUAGES) {
      expect(resolveLang({ enabled: true, lang: lang.tag }, null)).toBe(
        lang.tag,
      );
    }
  });
});
