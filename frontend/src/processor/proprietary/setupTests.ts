import "@editor-test/setupCommon";
import { vi } from "vitest";
import i18n from "i18next";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue ?? key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    mode: "saas",
    server_config: null,
    lock_connection_mode: false,
  }),
  isTauri: () => false,
}));
void i18n.init({
  lng: "en-US",
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
});
