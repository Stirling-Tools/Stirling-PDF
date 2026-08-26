import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@portal/contexts/ViewContext", () => ({
  useView: () => ({ setActiveView: vi.fn() }),
}));

const enterprise = { enabled: true, loading: false };
vi.mock("@portal/hooks/useEnterpriseEnabled", () => ({
  useEnterpriseEnabled: () => enterprise,
}));

vi.mock("@portal/components/infrastructure/ApiKeysTab", () => ({
  ApiKeysTab: () => <div data-testid="api-keys-tab" />,
}));
vi.mock("@portal/components/infrastructure/AuditTab", () => ({
  AuditTab: () => <div data-testid="audit-tab" />,
}));

import { Infrastructure } from "@portal/views/Infrastructure";

const T = "portal.infrastructure.tabs";

function renderView(initialPath = "/infrastructure") {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Infrastructure />
      </MemoryRouter>
    </MantineProvider>,
  );
}

function tabButtons() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.className.includes("sui-tabs__tab"));
}

describe("Infrastructure view", () => {
  beforeEach(() => {
    enterprise.enabled = true;
    enterprise.loading = false;
  });

  it("orders the working tabs first and defaults to API keys", () => {
    renderView();

    expect(tabButtons().map((b) => b.textContent)).toEqual([
      `${T}.apiKeys`,
      `${T}.audit`,
      `${T}.deployments`,
      `${T}.security`,
      `${T}.models`,
      `${T}.storage`,
    ]);
    expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
  });

  it("renders the backend-less tabs as inert: disabled, aria-disabled, never active", () => {
    renderView();

    const byLabel = new Map(tabButtons().map((b) => [b.textContent, b]));
    for (const key of ["deployments", "security", "models", "storage"]) {
      const btn = byLabel.get(`${T}.${key}`) as HTMLButtonElement;
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(btn);
      expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
    }
  });

  it("switches to the audit tab when clicked", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: `${T}.audit` }));
    expect(screen.getByTestId("audit-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("api-keys-tab")).not.toBeInTheDocument();
  });

  it("honours ?tab=audit deep links (used by the home visualiser)", () => {
    renderView("/infrastructure?tab=audit");

    expect(screen.getByTestId("audit-tab")).toBeInTheDocument();
  });

  it("ignores a deep link to a disabled tab and stays on the default", () => {
    renderView("/infrastructure?tab=storage");

    expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-tab")).not.toBeInTheDocument();
  });

  it("disables the audit tab (inert, never opens) for non-enterprise users", () => {
    enterprise.enabled = false;
    renderView();

    const auditBtn = screen.getByRole("button", { name: `${T}.audit` });
    expect(auditBtn).toBeDisabled();

    fireEvent.click(auditBtn);
    expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-tab")).not.toBeInTheDocument();
  });

  it("ignores a ?tab=audit deep link when not enterprise", () => {
    enterprise.enabled = false;
    renderView("/infrastructure?tab=audit");

    expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-tab")).not.toBeInTheDocument();
  });
});
