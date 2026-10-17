import type { BackendModule, ReadCallback, ResourceKey } from "i18next";

/** The subset the first screen resolves; i18next loads this one at init. */
export const STARTUP_FILE = "startup.json";

/** The complete dictionary, merged in after the first paint by `i18n.ts`. */
export const FULL_FILE = "translation.json";

const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

/** Delivery file URL for one language, honouring a subpath deployment. */
export function localeFileUrl(language: string, file: string): string {
  return `${BASE_PATH}/locales/${language}/${file}`;
}

/** Languages whose complete dictionary is already installed. */
const completeDictionaries = new Set<string>();

/** True when `loadFullDictionary` has nothing left to fetch for `language`. */
export function isDictionaryComplete(language: string): boolean {
  return completeDictionaries.has(language);
}

/** Records that `language` has the complete dictionary, not just the subset. */
export function markDictionaryComplete(language: string): void {
  completeDictionaries.add(language);
}

/** In-flight complete-dictionary loads, one per language. */
const pendingDictionaries = new Map<string, Promise<void>>();

/** The in-flight complete-dictionary load for `language`, if one is running. */
export function pendingDictionaryLoad(
  language: string,
): Promise<void> | undefined {
  return pendingDictionaries.get(language);
}

/** Runs `load` as the single in-flight complete-dictionary load for `language`. */
export function startDictionaryLoad(
  language: string,
  load: () => Promise<void>,
): Promise<void> {
  const pending = pendingDictionaries.get(language);
  if (pending) return pending;
  const request = load().finally(() => {
    pendingDictionaries.delete(language);
  });
  pendingDictionaries.set(language, request);
  return request;
}

export interface LocaleBackendOptions {
  loadPath: string | ((languages: string[], namespaces: string[]) => string);
/** Retried once when the requested language's file cannot be read, so a language with a missing or corrupt. */
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
  return loadPath.replace("{{lng}}", language).replace("{{ns}}", namespace);
}

async function loadJson(url: string): Promise<ResourceKey> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load translation file: ${url} (${response.status})`,
    );
  }
  return JSON.parse(await response.text()) as ResourceKey;
}

/** Loads the generated `startup.json` delivery files. */
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

    const readOne = () =>
      loadJson(url).catch((error: unknown) => {
        if (!fallbackUrl) throw error;
        return loadJson(fallbackUrl);
      });

    if (url !== localeFileUrl(language, FULL_FILE)) {
      void readOne()
        .then((resource) => {
          callback(null, resource);
        })
        .catch((error: unknown) => {
          callback(
            error instanceof Error ? error : new Error(String(error)),
            null,
          );
        });
      return;
    }

// A language switch asks for the complete dictionary, which `i18n.ts` may already have in memory or in flight.
    const pending = pendingDictionaryLoad(language);
    if (pending || isDictionaryComplete(language)) {
      void (pending ?? Promise.resolve())
        .then(() => {
          callback(null, {});
        })
        .catch((error: unknown) => {
          callback(
            error instanceof Error ? error : new Error(String(error)),
            null,
          );
        });
      return;
    }

    void startDictionaryLoad(language, async () => {
      const resource = await readOne();
      callback(null, resource);
      // i18next installs the bundle as the callback returns, so this is the
      // first point at which the strings are on their way in.
      markDictionaryComplete(language);
    }).catch((error: unknown) => {
      callback(
        error instanceof Error ? error : new Error(String(error)),
        null,
      );
    });
  }

  private options?: LocaleBackendOptions;
}
