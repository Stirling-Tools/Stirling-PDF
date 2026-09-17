import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConnectAccountRail } from "@portal/components/ConnectAccountRail";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
} from "@app/services/accountLinkBlock";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  linked: false,
  balance: undefined as
    | { remainingUnits: number; periodEnd: string }
    | undefined,
  openLinkModal: vi.fn(),
}));
vi.mock("@app/auth", () => ({ useAuth: () => ({ isAdmin: mocks.isAdmin }) }));
vi.mock("@app/ui", async () => ({ ...(await import("@app/ui/Button")) }));
vi.mock("@portal/hooks/useFreeTierBalance", () => ({
  useFreeTierBalance: () => ({ data: mocks.balance }),
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  useLinkOptional: () => ({ isLinked: mocks.linked }),
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: mocks.openLinkModal }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: "en-US" },
  }),
}));

describe("exhausted Processor rail", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
    mocks.isAdmin = true;
    mocks.linked = false;
    mocks.balance = undefined;
    mocks.openLinkModal.mockReset();
  });
  const mount = () =>
    render(
      <PortalTestProviders>
        <ConnectAccountRail />
      </PortalTestProviders>,
    );

  it("does not pitch linking just because the server is unlinked", () => {
    mount();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps the bespoke rail actionable after a background failure", () => {
    const view = mount();
    act(() => reportFreeTierExhausted("background"));
    expect(
      view.container.querySelector(".portal-connect-rail"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Team plan/)).toBeInTheDocument();
    expect(mocks.openLinkModal).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Link account for more credits" }),
    );
    expect(mocks.openLinkModal).toHaveBeenCalledWith("exhausted");
  });
  it("shows an exhausted balance without automatically opening a dialog", () => {
    mocks.balance = { remainingUnits: 0, periodEnd: "2026-10-01T00:00:00" };
    mount();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(mocks.openLinkModal).not.toHaveBeenCalled();
  });
  it("directs members to an administrator", () => {
    mocks.isAdmin = false;
    reportFreeTierExhausted("background");
    mount();
    expect(
      screen.getByText(/Ask your server administrator/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Link account for more credits" }),
    ).toBeNull();
  });
  it("removes the notice after linking", () => {
    mocks.linked = true;
    reportFreeTierExhausted("background");
    mount();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
