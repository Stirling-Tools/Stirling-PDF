/**
 * Portal i18n setup. Shares the editor's system via @shared/i18n: the same
 * TOML backend, the same language list, and the same Crowdin-managed
 * `public/locales/{lng}/translation.toml` layout. US English is the source.
 *
 * Imported once for its side effect (see portal/main.tsx) before the app
 * renders. The portal is a separate bundle, so it configures its own i18next
 * default instance.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import TomlBackend from "@shared/i18n/tomlBackend";
import { supportedLanguages, rtlLanguages } from "@shared/i18n/languages";

void i18n
  .use(TomlBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en-US",
    supportedLngs: Object.keys(supportedLanguages),
    load: "currentOnly",
    nonExplicitSupportedLngs: false,
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
i18n.on("languageChanged", (lng) => {
  document.documentElement.dir = rtlLanguages.includes(lng) ? "rtl" : "ltr";
  document.documentElement.lang = lng;
});

export default i18n;
