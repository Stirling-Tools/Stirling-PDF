import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { PortalRosterHost } from "@portal/components/settings/PortalRosterHost";
import { useLinkOptional } from "@portal/contexts/LinkContext";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
} from "@app/services/accountLinkBlock";
import { useUI } from "@app/portal/contexts/UIContext";

vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => true,
}));

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@app/portal/api/link", () => ({ fetchStatus }));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@app/portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModalHost: () => {
    const { linkModalOpen, linkModalMode, closeLinkModal } = useUI();
    return linkModalOpen ? (
      <div role="dialog" aria-label={linkModalMode}>
        <button onClick={closeLinkModal}>Not now</button>
      </div>
    ) : null;
  },
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

function RosterTransferSignIn() {
  const { openLinkModal } = useUI();
  return (
    <button onClick={() => openLinkModal("reauth")}>Renew cloud sign-in</button>
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
    sessionStorage.clear();
    clearAccountLinkBlock();
  });

  it("supports transfer sign-in in the shared roster without mounting linking on entry", async () => {
    fetchStatus.mockResolvedValue({ linked: true });
    render(
      <MemoryRouter initialEntries={["/settings/users"]}>
        <PortalRosterHost>
          <RosterTransferSignIn />
        </PortalRosterHost>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchStatus).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Renew cloud sign-in" }),
    );
    expect(await screen.findByRole("dialog", { name: "reauth" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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

      act(() => reportFreeTierExhausted());
      expect(
        screen.getByRole("dialog", { name: "exhausted" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      act(() => reportFreeTierExhausted());
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("leaves foreground prompts to the editor on unrelated routes", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    renderHost("/editor");
    await screen.findByText("unlinked");

    act(() => reportFreeTierExhausted());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a billing modal once for background policy exhaustion", async () => {
    fetchStatus.mockResolvedValue({ linked: false });
    renderHost();
    await screen.findByText("unlinked");

    act(() => reportFreeTierExhausted());
    expect(
      screen.getByRole("dialog", { name: "exhausted" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    act(() => reportFreeTierExhausted());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
