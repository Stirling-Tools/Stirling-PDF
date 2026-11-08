const STORAGE_KEY = "explicitPricingCurrency";

const REGION_CURRENCIES: Record<string, string> = {
  US: "usd",
  GB: "gbp",
  CA: "cad",
  AU: "aud",
  NZ: "nzd",
  CN: "cny",
  TW: "twd",
  HK: "hkd",
  SG: "sgd",
  IN: "inr",
  BR: "brl",
  ID: "idr",
  JP: "jpy",
  KR: "krw",
  CH: "chf",
  SE: "sek",
  DK: "dkk",
  NO: "nok",
  PL: "pln",
  RO: "ron",
  CZ: "czk",
  HU: "huf",
  MX: "mxn",
  ZA: "zar",
  TH: "thb",
  VN: "vnd",
  TR: "try",
  AE: "aed",
  SA: "sar",
  MY: "myr",
  PH: "php",
  IL: "ils",
};
const EURO_REGIONS = new Set([
  "AD",
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MC",
  "ME",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "SM",
  "VA",
]);

/** A display preference only; Stripe owns checkout currency selection. */
export function getCachedCurrency(): string | null {
  try {
    const currency = localStorage.getItem(STORAGE_KEY);
    return currency && /^[a-z]{3}$/.test(currency) ? currency : null;
  } catch {
    return null;
  }
}

/** Stores an explicit selection, never a browser-language guess. */
export function setCachedCurrency(currency: string): void {
  try {
    if (/^[a-z]{3}$/.test(currency))
      localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Private browsing may disable storage.
  }
}

/** Uses browser regions as price-lookup hints; unknown regions fall back to USD. */
export function getPreferredCurrency(): string {
  const explicit = getCachedCurrency();
  if (explicit) return explicit;
  const languages =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const language of languages) {
    try {
      const region = new Intl.Locale(language).region;
      if (!region) continue;
      if (EURO_REGIONS.has(region)) return "eur";
      if (REGION_CURRENCIES[region]) return REGION_CURRENCIES[region];
    } catch {
      // A malformed locale must not prevent checkout.
    }
  }
  return "usd";
}
