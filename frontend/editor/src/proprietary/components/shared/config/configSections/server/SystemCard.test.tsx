import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: {}, updatePreference: vi.fn() }),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { SystemCard } from "@app/components/shared/config/configSections/server/SystemCard";
import type { GeneralSettingsData } from "@app/components/shared/config/configSections/server/serverSettings";

function renderWithLocale(defaultLocale: string) {
  const settings = { ui: {}, system: { defaultLocale } } as GeneralSettingsData;
  render(
    <MantineProvider>
      <SystemCard
        settings={settings}
        setSettings={vi.fn()}
        isFieldPending={() => false}
        loginEnabled
      />
    </MantineProvider>,
  );
  return screen.getByPlaceholderText("en_US") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SystemCard default locale", () => {
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
