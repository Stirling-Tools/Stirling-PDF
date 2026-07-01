/**
 * Portal i18n setup. Shares the editor's system via @app/i18n: the same TOML
 * backend and language list. Keys live in the `portal` namespace
 * (`public/locales/{lng}/portal.toml`), separate from the editor's default
 * `translation` namespace. US English is the source.
 *
 * The portal now runs inside the editor app as a route-set, so it uses its OWN
 * i18next instance (not the default one, which the editor owns) — wired to the
 * portal subtree via <I18nextProvider> in PortalApp. Imported for its init side
 * effect.
 */
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import TomlBackend from "@app/i18n/tomlBackend";
import { supportedLanguages, rtlLanguages } from "@app/i18n/languages";

const portalI18n = createInstance();

void portalI18n
  .use(TomlBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en-US",
    supportedLngs: Object.keys(supportedLanguages),
    load: "currentOnly",
    nonExplicitSupportedLngs: false,
    // Portal strings live in their own namespace so they don't collide with the
    // editor's default `translation` namespace served from the same origin.
    ns: ["portal"],
    defaultNS: "portal",
    interpolation: {
      // React already escapes values, so i18next must not double-escape.
      escapeValue: false,
    },
    backend: {
      loadPath: (lngs: string[], namespaces: string[]) => {
        const basePath = import.meta.env.BASE_URL || "/";
        const cleanBasePath = basePath.endsWith("/")
          ? basePath.slice(0, -1)
          : basePath;
        return `${cleanBasePath}/locales/${lngs[0]}/${namespaces[0]}.toml`;
      },
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      convertDetectedLanguage: (lng: string) => (lng === "en" ? "en-US" : lng),
    },
    react: {
      useSuspense: true,
    },
  });

// Mirror the document direction/lang to the active language.
portalI18n.on("languageChanged", (lng) => {
  document.documentElement.dir = rtlLanguages.includes(lng) ? "rtl" : "ltr";
  document.documentElement.lang = lng;
});

export default portalI18n;
