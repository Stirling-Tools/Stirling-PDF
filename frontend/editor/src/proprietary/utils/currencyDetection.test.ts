import { beforeEach, expect, it } from "vitest";
import {
  getPreferredCurrency,
  setCachedCurrency,
} from "@app/utils/currencyDetection";

beforeEach(() => localStorage.clear());

it("defaults to USD and ignores previously cached locale guesses", () => {
  localStorage.setItem("preferredCurrency", "gbp");
  expect(getPreferredCurrency()).toBe("usd");
});

it("keeps an explicit pricing preference", () => {
  setCachedCurrency("eur");
  expect(getPreferredCurrency()).toBe("eur");
});

it("ignores malformed stored currencies", () => {
  localStorage.setItem("explicitPricingCurrency", "not-a-currency");
  expect(getPreferredCurrency()).toBe("usd");
});
