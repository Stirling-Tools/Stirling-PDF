import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { SaveModeDefaults } from "@editor/components/shared/config/configSections/server/SaveModeDefaults";
import type { GeneralSettingsData } from "@editor/components/shared/config/configSections/server/serverSettings";

function renderDefaults(system: GeneralSettingsData["system"]) {
  const setSettings = vi.fn();
  render(
    <MantineProvider>
      <SaveModeDefaults
        settings={{ ui: {}, system }}
        setSettings={setSettings}
        isFieldPending={() => false}
        loginEnabled
      />
    </MantineProvider>,
  );
  return setSettings;
}

describe("SaveModeDefaults", () => {
  it("names the setting the way the user preference does", () => {
    renderDefaults({ saveMode: "copy" });

    expect(
      screen.getByRole("textbox", { name: "When you save a file" }),
    ).toHaveValue("Save a copy next to it");
  });

  it("falls back to updating the original", () => {
    renderDefaults({});

    expect(
      screen.getByRole("textbox", { name: "When you save a file" }),
    ).toHaveValue("Update the original");
  });

  it("writes the lock into system settings", () => {
    const setSettings = renderDefaults({ saveMode: "ask" });

    fireEvent.click(screen.getByRole("switch"));

    expect(setSettings).toHaveBeenCalledWith({
      ui: {},
      system: { saveMode: "ask", allowUserSaveMode: false },
    });
  });
});
