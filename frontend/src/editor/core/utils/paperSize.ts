export type PaperFamily = "iso" | "northAmerican";

const LETTER_REGIONS = new Set([
  "BZ",
  "CA",
  "CL",
  "CO",
  "CR",
  "GT",
  "MX",
  "NI",
  "PA",
  "PH",
  "PR",
  "SV",
  "US",
  "VE",
]);

const NORTH_AMERICAN_SIZES = new Set(["LETTER", "LEGAL", "TABLOID"]);
const ISO_SIZE = /^[AB]\d+$/;

function browserLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

function localeRegion(locale: string, infer: boolean): string | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ?? (infer ? parsed.maximize().region : undefined);
  } catch {
    return undefined;
  }
}

export function preferredPaperFamily(
  locales: readonly string[] = browserLocales(),
): PaperFamily {
  const region =
    locales.map((locale) => localeRegion(locale, false)).find(Boolean) ??
    (locales[0] ? localeRegion(locales[0], true) : undefined);
  return region && LETTER_REGIONS.has(region) ? "northAmerican" : "iso";
}

export function paperFamilyOf(size: string): PaperFamily | undefined {
  const normalized = size.toUpperCase();
  if (NORTH_AMERICAN_SIZES.has(normalized)) return "northAmerican";
  if (ISO_SIZE.test(normalized)) return "iso";
  return undefined;
}

export function localPaperSize<T extends string>(
  iso: T,
  northAmerican: T,
  locales?: readonly string[],
): T {
  return preferredPaperFamily(locales) === "northAmerican"
    ? northAmerican
    : iso;
}

export function orderPaperSizeOptions<T extends { value: string }>(
  options: readonly T[],
  locales?: readonly string[],
): T[] {
  const preferred = preferredPaperFamily(locales);
  const slots = options
    .map((option, index) => ({
      option,
      index,
      family: paperFamilyOf(option.value),
    }))
    .filter((entry) => entry.family !== undefined);
  const reordered = [
    ...slots.filter((entry) => entry.family === preferred),
    ...slots.filter((entry) => entry.family !== preferred),
  ];
  const result = [...options];
  slots.forEach((slot, i) => {
    result[slot.index] = reordered[i].option;
  });
  return result;
}
