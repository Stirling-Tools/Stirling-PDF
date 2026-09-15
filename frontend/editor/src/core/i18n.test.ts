import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/i18n/tomlBackend", () => ({
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
}));

import i18n, { updateSupportedLanguages } from "@app/i18n";
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
