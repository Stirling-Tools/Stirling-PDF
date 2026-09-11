import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * The cadence decision, reversed from what it was: being unlinked is not a reason to ask anything.
 * The free tier is the product, so the only unprompted ask is the server reporting the month's
 * grant spent — and it is raised from the real reporter here rather than a hand-fired event, so the
 * sentinel shape stays part of what this pins down.
 */
const { openLinkModal } = vi.hoisted(() => ({ openLinkModal: vi.fn() }));

vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
}));

import { HttpError } from "@portal/api/http";
import { reportAccountLinkBlock } from "@portal/services/accountLinkBlock";
import { useFreeTierExhaustedPrompt } from "@portal/hooks/useFreeTierExhaustedPrompt";

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
  beforeEach(() => openLinkModal.mockReset());

  it("stays quiet on mount while the instance is unlinked", () => {
    render(<Probe />);
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it("opens on the allowance pitch when the grant is reported spent", () => {
    render(<Probe />);
    reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    expect(openLinkModal).toHaveBeenCalledWith("exhausted");
  });

  it("leaves a linked team's own billing problems to their own surface", () => {
    render(<Probe />);
    reportAccountLinkBlock(blocked("OVER_LIMIT"));
    reportAccountLinkBlock(blocked("REVOKED"));
    reportAccountLinkBlock(blocked("GRACE_EXPIRED"));
    expect(openLinkModal).not.toHaveBeenCalled();
  });

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
