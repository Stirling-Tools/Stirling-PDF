import "../test/setupCommon";
import { vi } from "vitest";
import i18n from "i18next";
import { installFailOnConsole } from "@editor/tests/failOnConsole";

void i18n.init({
  lng: "en-US",
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
});
installFailOnConsole();

vi.mock("@editor/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
  debugAuthEvents: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("i18next-http-backend", () => ({
  default: { type: "backend", init: vi.fn(), read: vi.fn(), save: vi.fn() },
}));
