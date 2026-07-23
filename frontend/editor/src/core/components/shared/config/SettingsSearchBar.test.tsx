import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SettingsSearchBar } from "@app/components/shared/config/SettingsSearchBar";
import type { ConfigNavSection } from "@app/components/shared/config/configNavSections";

const i18nMock = vi.hoisted(() => {
  const translations: Record<string, unknown> = {};
  const t = vi.fn(
    (key: string, fallback?: string | Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(translations, key)) {
        return translations[key];
      }

      return typeof fallback === "string" ? fallback : key;
    },
  );

  return { t, translations };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock("@app/components/shared/LocalIcon", () => ({
  default: () => null,
}));

const TestWrapper = ({ children }: { children: ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const configNavSections: ConfigNavSection[] = [
  {
    title: "Preferences",
    items: [
      {
        key: "general",
        label: "General",
        icon: "settings-rounded",
        component: null,
      },
    ],
  },
];

const renderSettingsSearchBar = () =>
  render(
    <TestWrapper>
      <SettingsSearchBar
        configNavSections={configNavSections}
        onNavigate={vi.fn()}
        isMobile={false}
      />
    </TestWrapper>,
  );

const searchFor = (query: string) => {
  const input = screen.getByPlaceholderText("Search settings pages...");
  fireEvent.focus(input);
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: query } });
};

describe("SettingsSearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(i18nMock.translations).forEach((key) => {
      delete i18nMock.translations[key];
    });
  });

  test("indexes and renders static translation content unchanged", () => {
    i18nMock.translations["settings.general"] = {
      summary: "Static general description:",
    };

    renderSettingsSearchBar();
    searchFor("static");

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Static general description:");
  });

  test("removes unresolved interpolation placeholders from matched context", () => {
    i18nMock.translations["settings.general"] = {
      defaultLabel: "Default: {{shortcut}}",
      notificationLabel: "Send {{email}} about {{message}}",
    };

    renderSettingsSearchBar();
    searchFor("default");

    expect(document.body).toHaveTextContent("Default");
    expect(document.body.textContent).not.toContain("{{shortcut}}");

    searchFor("send");

    expect(document.body).toHaveTextContent("Send about");
    expect(document.body.textContent).not.toContain("{{email}}");
    expect(document.body.textContent).not.toContain("{{message}}");
  });

  test("removes indexed Trans markup from matched context", () => {
    i18nMock.translations["settings.general"] = {
      markupLabel: "<0>test</0> setting",
    };

    renderSettingsSearchBar();
    searchFor("test");

    expect(document.body).toHaveTextContent("test setting");
    expect(document.body.textContent).not.toContain("<0>");
    expect(document.body.textContent).not.toContain("</0>");
  });

  test("does not render an option from placeholder-only content", () => {
    i18nMock.translations["settings.general"] = {
      emailOnly: "{{email}}",
      messageOnly: "<0>{{message}}</0>",
    };

    renderSettingsSearchBar();
    searchFor("email");

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("{{email}}");
  });
});
