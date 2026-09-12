import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { useLinkOptional } from "@portal/contexts/LinkContext";

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@portal/api/link", () => ({ fetchStatus }));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModal: () => null,
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
