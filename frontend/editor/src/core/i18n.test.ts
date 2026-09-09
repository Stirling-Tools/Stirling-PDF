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

  it("switches when the server default differs", async () => {
    await i18n.changeLanguage("en-US");
    const spy = vi.spyOn(i18n, "changeLanguage");
    updateSupportedLanguages(null, "de-DE");
    expect(spy).toHaveBeenCalledWith("de-DE");
    spy.mockRestore();
    await i18n.changeLanguage("en-US");
  });
});
