/**
 * i18next setup for the portal.
 *
 * The shared auth UI (and future portal copy) uses react-i18next's
 * `useTranslation()`, so the portal needs an initialised i18next instance.
 * Resources are empty for now: every `t(key, "Fallback")` call resolves to its
 * English fallback, so strings render correctly today while leaving a real
 * i18next instance to hang translations off later.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
