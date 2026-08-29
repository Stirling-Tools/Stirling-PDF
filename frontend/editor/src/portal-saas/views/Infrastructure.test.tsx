import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: string) => def ?? key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const enterprise = { enabled: true, loading: false };
vi.mock("@portal/hooks/useEnterpriseEnabled", () => ({
  useEnterpriseEnabled: () => enterprise,
}));

// Stub the live tab panels so the test doesn't pull their data dependencies.
vi.mock("@portal/components/infrastructure/ApiKeysTab", () => ({
  ApiKeysTab: () => <div data-testid="api-keys-tab" />,
}));
vi.mock("@portal/components/infrastructure/AuditTab", () => ({
  AuditTab: () => <div data-testid="audit-tab" />,
}));

import { Infrastructure } from "@portal/views/Infrastructure";

describe("Infrastructure (SaaS)", () => {
  beforeEach(() => {
    enterprise.enabled = true;
    enterprise.loading = false;
  });

  it("defaults to the live API keys tab and drops the manage-editor button", () => {
    render(<Infrastructure />);
    expect(screen.getByTestId("api-keys-tab")).toBeInTheDocument();
    expect(
      screen.queryByText("portal.infrastructure.manageEditorDeployment"),
    ).not.toBeInTheDocument();
  });

  it("renders the not-yet-shipped tabs as disabled 'coming soon'", () => {
    render(<Infrastructure />);
    for (const tab of ["deployments", "security", "models", "storage"]) {
      const btn = screen.getByRole("button", {
        name: new RegExp(`portal.infrastructure.tabs.${tab}`),
      });
      expect(btn).toBeDisabled();
    }
    // The live tabs are not disabled.
    expect(
      screen.getByRole("button", {
        name: /portal.infrastructure.tabs.apiKeys/,
      }),
    ).toBeEnabled();
  });

  it("disables the audit tab for non-enterprise tenants", () => {
    enterprise.enabled = false;
    render(<Infrastructure />);
    expect(
      screen.getByRole("button", {
        name: /portal.infrastructure.tabs.audit/,
      }),
    ).toBeDisabled();
  });
});
