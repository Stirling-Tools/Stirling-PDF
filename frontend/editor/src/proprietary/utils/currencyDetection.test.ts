import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getPreferredCurrency,
  setCachedCurrency,
} from "@app/utils/currencyDetection";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["en-GB", "gbp"],
  ["de-DE", "eur"],
  ["fr-CA", "cad"],
  ["de-CH", "chf"],
  ["zh-Hant-TW", "twd"],
  ["ja-JP", "jpy"],
  ["en-AU", "aud"],
  ["unknown", "usd"],
  ["invalid_locale", "usd"],
])("uses %s as a display hint for %s", (language, currency) => {
  vi.stubGlobal("navigator", { languages: [language] });
  expect(getPreferredCurrency()).toBe(currency);
  expect(localStorage.length).toBe(0);
});

it("uses the next browser locale when the first has no known region", () => {
  vi.stubGlobal("navigator", { languages: ["en", "en-GB"] });
  expect(getPreferredCurrency()).toBe("gbp");
});

it("ignores previously cached guesses and detects the current browser region", () => {
  localStorage.setItem("preferredCurrency", "usd");
  vi.stubGlobal("navigator", { language: "en-GB" });
  expect(getPreferredCurrency()).toBe("gbp");
});

it("keeps an explicit pricing preference ahead of the browser hint", () => {
  vi.stubGlobal("navigator", { languages: ["en-GB"] });
  setCachedCurrency("eur");
  expect(getPreferredCurrency()).toBe("eur");
});

it("falls back to USD when neither storage nor browser provides a currency", () => {
  localStorage.setItem("explicitPricingCurrency", "not-a-currency");
  vi.stubGlobal("navigator", undefined);
  expect(getPreferredCurrency()).toBe("usd");
});
