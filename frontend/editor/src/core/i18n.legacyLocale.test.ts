import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOCALES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/locales",
);
const SERBIAN = "sr-Latn-RS";
const serbianCancel = parse(
  fs.readFileSync(path.join(LOCALES_DIR, SERBIAN, "translation.toml"), "utf8"),
).cancel;

// Exact-case folder lookup: Windows and macOS disks would otherwise hide a casing mismatch.
function serveLocale(url: string) {
  const folder = /\/locales\/([^/]+)\/translation\.toml$/.exec(url)?.[1];
  const exists = !!folder && fs.readdirSync(LOCALES_DIR).includes(folder);
  const body = exists
    ? fs.readFileSync(
        path.join(LOCALES_DIR, folder, "translation.toml"),
        "utf8",
      )
    : "";
  return Promise.resolve({
    ok: exists,
    status: exists ? 200 : 404,
    text: () => Promise.resolve(body),
  });
}

async function loadI18n() {
  vi.resetModules();
  const i18nModule = await import("@app/i18n");
  const i18n = i18nModule.default;
  await vi.waitFor(() =>
    expect(i18n.hasResourceBundle(i18n.language, "translation")).toBe(true),
  );
  return i18nModule;
}

// Every test re-imports @app/i18n and its module graph cold.
describe("stored Serbian language preference", { timeout: 20_000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(serveLocale));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each(["sr-LATN-RS", "sr_LATN_RS"])(
    "resolves a stored legacy %s to Serbian",
    async (legacy) => {
      localStorage.setItem("i18nextLng", legacy);
      localStorage.setItem("i18nextLng-source", "3");

      const { default: i18n } = await loadI18n();

      expect(i18n.language).toBe(SERBIAN);
      expect(i18n.resolvedLanguage).toBe(SERBIAN);
      expect(fetch).toHaveBeenCalledWith(
        `/locales/${SERBIAN}/translation.toml`,
      );
      expect(i18n.t("cancel")).toBe(serbianCancel);
      expect(serbianCancel).not.toBe("Cancel");
    },
  );

  it("applies a legacy sr_LATN_RS server default locale", async () => {
    const { default: i18n, updateSupportedLanguages } = await loadI18n();

    updateSupportedLanguages(null, "sr_LATN_RS");

    await vi.waitFor(() => expect(i18n.resolvedLanguage).toBe(SERBIAN));
    expect(i18n.t("cancel")).toBe(serbianCancel);
  });
});
