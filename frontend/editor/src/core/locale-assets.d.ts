/**
 * Types for the standalone Node scripts the build imports.
 *
 * `scripts/generate-locale-assets.mjs` is plain JavaScript because Vite loads
 * it directly; the declaration keeps the tests that call it type-checked.
 */
declare module "*generate-locale-assets.mjs" {
  export interface LocaleAssetsResult {
    written: Array<{ code: string; bytes: number }>;
    skipped: number;
    fallbackBytes: number;
    startupBytes: number;
  }

  export function generateLocaleAssets(options?: {
    force?: boolean;
    log?: (message: string) => void;
    localesDir?: string;
    startupKeysPath?: string;
  }): LocaleAssetsResult;

  /** Locale codes that actually get a delivery file, for the startup preload. */
  export function deliveredLocaleCodes(): string[];
}
