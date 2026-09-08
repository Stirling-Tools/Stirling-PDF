import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn() },
}));
vi.mock("@app/hooks/useAdminSettings", () => ({
  useAdminSettings: () => ({
    settings: h.settings,
    rawSettings: {},
    loading: false,
    saving: false,
    setSettings: vi.fn(),
    fetchSettings: vi.fn(),
    saveSettings: vi.fn(),
    isFieldPending: () => false,
    hasPendingChanges: () => false,
  }),
}));
vi.mock("@app/components/shared/config/useRestartServer", () => ({
  useRestartServer: () => ({
    restartModalOpened: false,
    showRestartModal: vi.fn(),
    closeRestartModal: vi.fn(),
    restartServer: vi.fn(),
  }),
}));
vi.mock("@app/hooks/useSettingsDirty", () => ({
  useSettingsDirty: () => ({
    isDirty: false,
    resetToSnapshot: vi.fn(),
    markSaved: vi.fn(),
  }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: {}, updatePreference: vi.fn() }),
}));
vi.mock("@app/contexts/UnsavedChangesContext", () => ({
  useUnsavedChanges: () => ({ markClean: vi.fn() }),
}));
vi.mock("@app/hooks/useLoginRequired", () => ({
  useLoginRequired: () => ({
    loginEnabled: true,
    validateLoginEnabled: () => true,
  }),
}));
// Partial mocks: @app/i18n initialises i18next at import time and needs the
// real initReactI18next, and the component only touches two router hooks.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => ({ hash: "", pathname: "/settings/adminGeneral" }),
  useNavigate: () => vi.fn(),
}));

import AdminGeneralSection from "@app/components/shared/config/configSections/AdminGeneralSection";

function renderWithLocale(defaultLocale: string) {
  h.settings = { ui: {}, system: { defaultLocale } };
  render(
    <MantineProvider>
      <AdminGeneralSection />
    </MantineProvider>,
  );
  return screen.getByPlaceholderText("en_US") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminGeneralSection default locale", () => {
  // The Select's options are keyed on the underscore form, but
  // SYSTEM_DEFAULTLOCALE accepts a hyphenated tag too, and the backend stores
  // whichever form was configured.
  it("shows the configured language for the underscore form", () => {
    expect(renderWithLocale("en_GB").value).toBe("English (UK) (en-GB)");
  });

  it("shows the configured language for the hyphenated form", () => {
    expect(renderWithLocale("en-GB").value).toBe("English (UK) (en-GB)");
  });

  it("matches a lowercased region tag", () => {
    expect(renderWithLocale("en-gb").value).toBe("English (UK) (en-GB)");
  });

  it("leaves the field empty when no locale is configured", () => {
    expect(renderWithLocale("").value).toBe("");
  });
});
