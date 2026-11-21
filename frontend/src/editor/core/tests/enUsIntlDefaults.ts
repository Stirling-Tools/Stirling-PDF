const DEFAULT_LOCALE = "en-US";
const MARKER = Symbol.for("stirlingpdf.tests.enUsIntlDefaults");

type MarkedGlobal = typeof globalThis & { [MARKER]?: boolean };

/**
 * Test setup pins i18n to en-US; Intl must agree so literal expectations such
 * as "2,500" and "Jun" are stable even on machines with another OS locale.
 * Explicit locales passed by callers are preserved.
 */
export function installEnUsIntlDefaults(): void {
  const scope = globalThis as MarkedGlobal;
  if (scope[MARKER]) return;
  scope[MARKER] = true;

  const OriginalNumberFormat = Intl.NumberFormat;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  class TestNumberFormat extends OriginalNumberFormat {
    constructor(
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      super(locales ?? DEFAULT_LOCALE, options);
    }
  }

  class TestDateTimeFormat extends OriginalDateTimeFormat {
    constructor(
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      super(locales ?? DEFAULT_LOCALE, options);
    }
  }

  Intl.NumberFormat = TestNumberFormat as typeof Intl.NumberFormat;
  Intl.DateTimeFormat = TestDateTimeFormat as typeof Intl.DateTimeFormat;

  const numberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ): string {
    return numberToLocaleString.call(this, locales ?? DEFAULT_LOCALE, options);
  };

  const bigIntToLocaleString = BigInt.prototype.toLocaleString;
  BigInt.prototype.toLocaleString = function (
    this: bigint,
    locales?: Intl.LocalesArgument,
    options?: BigIntToLocaleStringOptions,
  ): string {
    return bigIntToLocaleString.call(this, locales ?? DEFAULT_LOCALE, options);
  };

  const dateToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    return dateToLocaleString.call(this, locales ?? DEFAULT_LOCALE, options);
  };

  const dateToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    return dateToLocaleDateString.call(
      this,
      locales ?? DEFAULT_LOCALE,
      options,
    );
  };

  const dateToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    return dateToLocaleTimeString.call(
      this,
      locales ?? DEFAULT_LOCALE,
      options,
    );
  };
}
