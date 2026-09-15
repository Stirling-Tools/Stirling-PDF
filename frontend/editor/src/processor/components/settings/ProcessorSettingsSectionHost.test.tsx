import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcessorSettingsSectionHost } from "@processor/components/settings/ProcessorSettingsSectionHost";
import { useLinkOptional } from "@processor/contexts/LinkContext";

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@processor/api/link", () => ({ fetchStatus }));
vi.mock("@processor/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@processor/components/account-link/LinkAccountModal", () => ({
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
      <ProcessorSettingsSectionHost>
        <LinkState />
      </ProcessorSettingsSectionHost>,
    );
    expect(screen.getByText("checking")).toBeInTheDocument();
    resolve({ linked: true });
    expect(await screen.findByText("linked")).toBeInTheDocument();
  });

  it("uses a confirmed unlinked status for local billing", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    render(
      <ProcessorSettingsSectionHost>
        <LinkState />
      </ProcessorSettingsSectionHost>,
    );
    expect(await screen.findByText("unlinked")).toBeInTheDocument();
  });
});
