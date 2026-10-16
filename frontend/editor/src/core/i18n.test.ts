import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors the real module's exports: `i18n.ts` resolves file URLs through it and
// tracks which languages already have the complete dictionary.
vi.mock("@app/i18n/localeBackend", () => {
  const complete = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  return {
    STARTUP_FILE: "startup.json",
    FULL_FILE: "translation.json",
    localeFileUrl: (language: string, file: string) =>
      `/locales/${language}/${file}`,
    isDictionaryComplete: (language: string) => complete.has(language),
    markDictionaryComplete: (language: string) => complete.add(language),
    pendingDictionaryLoad: (language: string) => pending.get(language),
    startDictionaryLoad: (language: string, load: () => Promise<void>) => {
      const existing = pending.get(language);
      if (existing) return existing;
      const request = load().finally(() => {
        pending.delete(language);
      });
      pending.set(language, request);
      return request;
    },
    default: {
      type: "backend",
      init() {},
      read(
        _lng: string,
        _ns: string,
        callback: (err: unknown, res: unknown) => void,
      ) {
        callback(null, {});
      },
    },
  };
});

import i18n, {
  installFullDictionaryOnIntent,
  loadFullDictionary,
  updateSupportedLanguages,
} from "@app/i18n";
import { I18N_STORAGE_KEYS, LanguageSource } from "@app/i18n/languages";

describe("updateSupportedLanguages", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("skips the reload when the server default matches the current language", async () => {
    await i18n.changeLanguage("en-US");
    const spy = vi.spyOn(i18n, "changeLanguage");
    updateSupportedLanguages(null, "en-US");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still records the source when the reload is skipped", async () => {
    await i18n.changeLanguage("en-US");
    updateSupportedLanguages(null, "en-US");
    expect(localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE)).toBe("en-US");
    expect(localStorage.getItem(I18N_STORAGE_KEYS.LANGUAGE_SOURCE)).toBe(
      String(LanguageSource.ServerDefault),
    );
  });

  it("switches when the server default differs", async () => {
    await i18n.changeLanguage("en-US");
    const spy = vi.spyOn(i18n, "changeLanguage");
    updateSupportedLanguages(null, "de-DE");
    expect(spy).toHaveBeenCalledWith("de-DE");
    spy.mockRestore();
    await i18n.changeLanguage("en-US");
  });
});

describe("loadFullDictionary", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges the complete dictionary once per language", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ startup: { marker: "complete" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await loadFullDictionary("de-DE");
    await loadFullDictionary("de-DE");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/locales/de-DE/translation.json");
    expect(i18n.getResource("de-DE", "translation", "startup.marker")).toBe(
      "complete",
    );
  });

  it("shares one request between concurrent callers", async () => {
    let release: (() => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ startup: { marker: "shared" } }),
            });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = loadFullDictionary("fr-FR");
    const second = loadFullDictionary("fr-FR");
    release?.();
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(i18n.getResource("fr-FR", "translation", "startup.marker")).toBe(
      "shared",
    );
  });

  it("rejects a required load whose dictionary cannot be read, and still retries", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("no delivery server");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadFullDictionary("es-ES")).rejects.toThrow(
      "no delivery server",
    );
    await expect(loadFullDictionary("es-ES")).rejects.toThrow(
      "no delivery server",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an intent prefetch failure quiet", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("no delivery server");
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    installFullDictionaryOnIntent();
    document.dispatchEvent(new Event("pointerdown"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
