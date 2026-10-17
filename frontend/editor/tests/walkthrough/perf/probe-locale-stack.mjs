/**
 * Why a locale file is fetched, twice if need be. Patches fetch/XHR at document
 * start and prints the caller stack for every locale request.
 */

import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const locale = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage(locale ? { locale } : {});
await page.addInitScript(() => {
  const note = (target, stack) =>
    console.log(`LOCALE_REQ ${target}\n${(stack ?? "").split("\n").slice(1, 7).join("\n")}`);
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const target = typeof input === "string" ? input : (input?.url ?? "");
    if (String(target).includes("locales")) note(target, new Error().stack);
    return originalFetch.call(this, input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes("locales")) note(url, new Error().stack);
    return open.call(this, method, url, ...rest);
  };
});
page.on("console", (m) => {
  const text = m.text();
  if (text.startsWith("LOCALE_REQ") || text.includes("locales")) console.log(text);
});
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const flatten = (obj, prefix = "", out = []) => {
        for (const [k, v] of Object.entries(obj ?? {})) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object" && !Array.isArray(v))
            flatten(v, path, out);
          else if (typeof v === "string") out.push(path);
        }
        return out;
      };
      const i18n = globalThis.i18next;
      const keys = flatten(i18n?.getResourceBundle(i18n.language, "translation"));
      let missing = 0;
      for (let i = 0; i < keys.length; i += 37) {
        if (i18n.t(keys[i]) === keys[i]) missing += 1;
      }
      return {
        lng: i18n?.language,
        fallbackLng: i18n?.options?.fallbackLng,
        supportedLngs: i18n?.options?.supportedLngs,
        load: i18n?.options?.load,
        bundleKeys: keys.length,
        missingKeys: missing,
      };
    }),
  ),
);
await browser.close();
