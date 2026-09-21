import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalSettingsSectionHost } from "@app/portal/components/settings/PortalSettingsSectionHost";
import { useLinkOptional } from "@app/portal/contexts/LinkContext";

vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => true,
}));

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@app/portal/api/link", () => ({ fetchStatus }));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@app/portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModalHost: () => null,
}));

vi.mock(
  "@app/portal/components/account-link/AccountLinkSessionBoundary",
  () => ({
    AccountLinkSessionBoundary: ({ children }: { children: ReactNode }) =>
      children,
  }),
);
vi.mock("@app/portal/components/account-link/SaasSessionBanner", () => ({
  SaasSessionBanner: () => null,
}));
vi.mock("@app/portal/components/account-link/ConnectCallbackHost", () => ({
  ConnectCallbackHost: () => null,
}));

function LinkState() {
  const link = useLinkOptional();
  return (
    <output>
      {link?.statusKnown ? (link.isLinked ? "linked" : "unlinked") : "checking"}
    </output>
  );
}

describe("settings link status", () => {
  beforeEach(() => fetchStatus.mockReset());

  it("does not claim an unlinked server while its status is still loading", async () => {
    let resolve!: (value: { linked: boolean }) => void;
    fetchStatus.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(
      <PortalSettingsSectionHost>
        <LinkState />
      </PortalSettingsSectionHost>,
    );
    expect(screen.getByText("checking")).toBeInTheDocument();
    resolve({ linked: true });
    expect(await screen.findByText("linked")).toBeInTheDocument();
  });

  it("uses a confirmed unlinked status for local billing", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    render(
      <PortalSettingsSectionHost>
        <LinkState />
      </PortalSettingsSectionHost>,
    );
    expect(await screen.findByText("unlinked")).toBeInTheDocument();
  });
});
