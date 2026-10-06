import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { UserDefaultsCard } from "@app/components/shared/config/configSections/server/UserDefaultsCard";
import type { UiDefaultsSettingsData } from "@app/components/shared/config/configSections/server/serverSettings";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const settings: UiDefaultsSettingsData = {
  defaultHideUnavailableTools: false,
  defaultHideUnavailableConversions: false,
  defaultToolPanelMode: "sidebar",
  defaultStartupView: "tools",
};

describe("UserDefaultsCard", () => {
  it("names the new controls and keeps their labels out of a paragraph", () => {
    const { container } = render(
      <MantineProvider>
        <UserDefaultsCard
          settings={settings}
          setSettings={vi.fn()}
          isFieldPending={() => false}
          loginEnabled
        />
      </MantineProvider>,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Default tool picker mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Default view on launch" }),
    ).toBeInTheDocument();
    // Text renders a <p>; a Group inside it is the div-in-p warning.
    expect(container.querySelector("p div, p > div")).toBeNull();
  });
});
