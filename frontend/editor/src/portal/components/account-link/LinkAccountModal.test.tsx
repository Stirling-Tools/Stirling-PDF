import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The Connect flow's step machine. What matters here is that the pitch is never skipped for a
 * fresh link, that re-auth never grows a pitch or a success screen it has no business showing,
 * and that reaching the confirmation is driven by the link actually landing rather than by the
 * sign-in promise resolving.
 */
const { fetchWallet } = vi.hoisted(() => ({ fetchWallet: vi.fn() }));

vi.mock("@portal/api/billing", () => ({ fetchWallet }));
vi.mock("@portal/auth/saasSupabase", () => ({
  PENDING_LINK_KEY: "stirling_pending_link",
  isSaasSupabaseConfigured: true,
  isSaasOAuthAvailable: false,
  SAAS_OAUTH_PROVIDERS: [],
  ensureSaasSupabase: () => null,
}));

import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";

type Props = Parameters<typeof LinkAccountModal>[0];

const BENEFITS = /Pipelines, policies, sources and audit/;
const SIGN_IN = /This server connects once/;
const REAUTH = /Your session expired/;
const DONE = /now runs against your Stirling account/;

const wrap = (props: Props, open: boolean) => (
  <PortalTestProviders>
    <MemoryRouter>
      <LinkAccountModal {...props} open={open} />
    </MemoryRouter>
  </PortalTestProviders>
);

function renderModal(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onClose: vi.fn(),
    onLinked: vi.fn(),
    ...overrides,
  };
  const utils = render(wrap(props, true));
  return { ...utils, props };
}

describe("LinkAccountModal", () => {
  it("opens on the benefits step, not the login form", () => {
    renderModal();
    expect(screen.getByText(BENEFITS)).toBeTruthy();
    expect(screen.queryByText(SIGN_IN)).toBeNull();
  });

  it("advances to sign-in only once the admin asks to connect", () => {
    renderModal();
    fireEvent.click(screen.getByText("Connect account"));
    expect(screen.getByText(SIGN_IN)).toBeTruthy();
  });

  it("goes back to the benefits from sign-in", () => {
    renderModal();
    fireEvent.click(screen.getByText("Connect account"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText(BENEFITS)).toBeTruthy();
  });

  it("shows the confirmation once the instance reports linked", async () => {
    fetchWallet.mockRejectedValue(new Error("no session"));
    renderModal({ status: { linked: true, name: "acme-corp" } });
    await waitFor(() => expect(screen.getByText(DONE)).toBeTruthy());
  });

  it("keeps re-auth a single sign-in step with no pitch or confirmation", () => {
    renderModal({
      mode: "reauth",
      status: { linked: true, name: "acme-corp" },
    });
    expect(screen.getByText(REAUTH)).toBeTruthy();
    expect(screen.queryByText(BENEFITS)).toBeNull();
    expect(screen.queryByText(DONE)).toBeNull();
  });

  it("surfaces a failed link on the sign-in step rather than advancing", () => {
    renderModal({ linkError: "Upstream rejected the token" });
    fireEvent.click(screen.getByText("Connect account"));
    expect(screen.getByText("Upstream rejected the token")).toBeTruthy();
    expect(screen.queryByText(DONE)).toBeNull();
  });

  it("restarts the pitch after being dismissed", () => {
    const { rerender, props } = renderModal();
    fireEvent.click(screen.getByText("Connect account"));
    rerender(wrap(props, false));
    rerender(wrap(props, true));
    expect(screen.getByText(BENEFITS)).toBeTruthy();
  });
});
