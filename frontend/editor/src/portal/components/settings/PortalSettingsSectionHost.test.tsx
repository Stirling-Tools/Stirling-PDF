import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { useLinkOptional } from "@portal/contexts/LinkContext";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
} from "@app/services/accountLinkBlock";

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@portal/api/link", () => ({ fetchStatus }));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModal: ({
    mode,
    onClose,
  }: {
    mode: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={mode}>
      <button onClick={onClose}>Not now</button>
    </div>
  ),
}));

function LinkState() {
  const link = useLinkOptional();
  return (
    <output>
      {link?.statusKnown ? (link.isLinked ? "linked" : "unlinked") : "checking"}
    </output>
  );
}

function renderHost(path = "/settings/billing") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalSettingsSectionHost>
        <LinkState />
      </PortalSettingsSectionHost>
    </MemoryRouter>,
  );
}

describe("settings link status", () => {
  beforeEach(() => {
    fetchStatus.mockReset();
    clearAccountLinkBlock();
  });

  it("does not claim an unlinked server while its status is still loading", async () => {
    let resolve!: (value: { linked: boolean }) => void;
    fetchStatus.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderHost();
    expect(screen.getByText("checking")).toBeInTheDocument();
    resolve({ linked: true });
    expect(await screen.findByText("linked")).toBeInTheDocument();
  });

  it("uses a confirmed unlinked status for local billing", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    renderHost();
    expect(await screen.findByText("unlinked")).toBeInTheDocument();
  });

  it.each(["/settings/billing", "/settings/account-link"])(
    "shows a foreground exhaustion prompt only once at %s",
    async (path) => {
      fetchStatus.mockResolvedValue({ linked: false });
      renderHost(path);
      await screen.findByText("unlinked");

      act(() => reportFreeTierExhausted("foreground"));
      expect(
        screen.getByRole("dialog", { name: "exhausted" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      act(() => reportFreeTierExhausted("foreground"));
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("leaves foreground prompts to the editor on unrelated routes", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    renderHost("/editor");
    await screen.findByText("unlinked");

    act(() => reportFreeTierExhausted("foreground"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open a billing modal for background policy exhaustion", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    renderHost();
    await screen.findByText("unlinked");

    act(() => reportFreeTierExhausted("background"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
