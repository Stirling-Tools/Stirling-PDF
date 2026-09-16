import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * The cadence decision, reversed from what it was: being unlinked is not a reason to ask anything.
 * The free tier is the product, so the only unprompted ask is the server reporting the month's
 * grant spent — and it is raised from the real reporter here rather than a hand-fired event, so the
 * sentinel shape stays part of what this pins down.
 */
const { openLinkModal, flags } = vi.hoisted(() => ({
  openLinkModal: vi.fn(),
  flags: { isAdmin: true, isLinked: false, orgOwner: true },
}));
vi.mock("@app/auth", () => ({
  useAuth: () => ({ ...flags, user: { orgOwner: flags.orgOwner } }),
}));
vi.mock("@app/portal/contexts/LinkContext", () => ({ useLink: () => flags }));

vi.mock("@app/portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
}));

import { HttpError } from "@app/portal/api/http";
import { reportAccountLinkBlock } from "@app/portal/services/accountLinkBlock";
import { useFreeTierExhaustedPrompt } from "@app/portal/hooks/useFreeTierExhaustedPrompt";

function Probe() {
  useFreeTierExhaustedPrompt();
  return null;
}

const blocked = (reason: string) =>
  new HttpError(402, "Payment Required", {
    error: "ACCOUNT_LINK_REQUIRED",
    reason,
  });

describe("the account-link prompt", () => {
  beforeEach(() => {
    openLinkModal.mockReset();
    flags.isAdmin = true;
    flags.orgOwner = true;
    flags.isLinked = false;
  });

  it("stays quiet on mount while the instance is unlinked", () => {
    render(<Probe />);
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it("opens on the allowance pitch when the grant is reported spent", () => {
    render(<Probe />);
    reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    expect(openLinkModal).toHaveBeenCalledWith("exhausted");
  });

  it("does not reopen for later responses from the same exhausted batch", () => {
    const view = render(<Probe />);
    reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    view.rerender(<Probe />);
    reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    expect(openLinkModal).toHaveBeenCalledOnce();
  });

  it("leaves a linked team's own billing problems to their own surface", () => {
    render(<Probe />);
    reportAccountLinkBlock(blocked("OVER_LIMIT"));
    reportAccountLinkBlock(blocked("REVOKED"));
    reportAccountLinkBlock(blocked("GRACE_EXPIRED"));
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it.each(["non-owner", "already linked"])(
    "does not offer initial linking to %s",
    (state) => {
      flags.isAdmin = state !== "non-owner";
      flags.isLinked = state === "already linked";
      render(<Probe />);
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
      expect(openLinkModal).not.toHaveBeenCalled();
    },
  );

  it("ignores an unrelated failure", () => {
    render(<Probe />);
    reportAccountLinkBlock(new HttpError(403, "Forbidden", null));
    reportAccountLinkBlock(new Error("network"));
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    render(<Probe />).unmount();
    reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    expect(openLinkModal).not.toHaveBeenCalled();
  });
});

it("does not prompt an ordinary admin when the local allowance is exhausted", () => {
  flags.isAdmin = true;
  flags.orgOwner = false;
  flags.isLinked = false;
  openLinkModal.mockReset();
  render(<Probe />);
  window.dispatchEvent(new Event("stirling:portal-free-tier-exhausted"));
  expect(openLinkModal).not.toHaveBeenCalled();
});
