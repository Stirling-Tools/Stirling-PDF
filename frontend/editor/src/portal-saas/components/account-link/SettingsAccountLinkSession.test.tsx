import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsAccountLinkSession } from "@app/portal/components/account-link/SettingsAccountLinkSession";

vi.mock("@app/portal/contexts/AccountLinkContext", () => ({
  AccountLinkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/auth", () => ({
  useAuth: () => {
    throw new Error("Self-hosted owner binding must not run in SaaS settings");
  },
}));

describe("SaaS settings account session", () => {
  it("uses the SaaS override without binding a local owner or installing a callback handler", () => {
    render(
      <SettingsAccountLinkSession>
        <p>SaaS settings</p>
      </SettingsAccountLinkSession>,
    );
    expect(screen.getByText("SaaS settings")).toBeTruthy();
  });
});
