import type { BackendModule, ReadCallback, ResourceKey } from "i18next";

export interface LocaleBackendOptions {
  loadPath:
    | string
    | ((languages: string[], namespaces: string[]) => string);
  /**
   * Retried once when the requested language's file cannot be read, so a
   * language with a missing or corrupt delivery file falls back to the source
   * strings instead of rendering every key verbatim. The build already merged
   * those strings into each file; this only covers the file itself failing.
   */
  fallbackLocale?: string;
}

/** Resolves a possibly-function `loadPath` for one language and namespace. */
function urlFor(
  loadPath: LocaleBackendOptions["loadPath"],
  language: string,
  namespace: string,
): string | null {
  if (typeof loadPath === "function") return loadPath([language], [namespace]);
  if (!loadPath) return null;
  return loadPath
    .replace("{{lng}}", language)
    .replace("{{ns}}", namespace);
}

async function loadJson(url: string): Promise<ResourceKey> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load translation file: ${url} (${response.status})`);
  }
  return JSON.parse(await response.text()) as ResourceKey;
}

/**
 * Loads the generated `translation.json` delivery files.
 *
 * They are JSON rather than the authored TOML for two reasons: the browser does
 * not have to parse 500 KB of TOML on the startup path, and each file already
 * contains the source locale's values for the keys that language is missing, so
 * i18next never needs to fetch a second dictionary. `translation.toml` stays
 * the authoring format; `scripts/generate-locale-assets.mjs` derives these from
 * it at build time.
 */
export default class LocaleBackend implements BackendModule<LocaleBackendOptions> {
  static type = "backend" as const;
  type = "backend" as const;

  constructor(services?: unknown, options?: LocaleBackendOptions) {
    this.init(services, options);
  }

  init(_services?: unknown, options?: LocaleBackendOptions): void {
    this.options = options;
  }

  read(language: string, namespace: string, callback: ReadCallback): void {
    const loadPath = this.options?.loadPath;
    const url = loadPath ? urlFor(loadPath, language, namespace) : null;
    if (!url) {
      callback(new Error("loadPath is not configured"), null);
      return;
    }

    const fallback = this.options?.fallbackLocale;
    const fallbackUrl =
      loadPath && fallback && fallback !== language
        ? urlFor(loadPath, fallback, namespace)
        : null;

    void loadJson(url)
      .catch((error: unknown) => {
        if (!fallbackUrl) throw error;
        return loadJson(fallbackUrl);
      })
      .then((resource) => {
        callback(null, resource);
      })
      .catch((error: unknown) => {
        callback(
          error instanceof Error ? error : new Error(String(error)),
          null,
        );
      });
  }

  private options?: LocaleBackendOptions;
}
