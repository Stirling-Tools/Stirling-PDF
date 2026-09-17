import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const { openLinkModal } = vi.hoisted(() => ({ openLinkModal: vi.fn() }));

vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
}));

import { HttpError } from "@portal/api/http";
import { reportAccountLinkBlock } from "@portal/services/accountLinkBlock";
import { clearAccountLinkBlock } from "@app/services/accountLinkBlock";
import { useFreeTierExhaustedPrompt } from "@portal/hooks/useFreeTierExhaustedPrompt";

function Probe({ enabled = true }: { enabled?: boolean }) {
  useFreeTierExhaustedPrompt(enabled);
  return null;
}

const blocked = (reason: string) =>
  new HttpError(402, "Payment Required", {
    error: "ACCOUNT_LINK_REQUIRED",
    reason,
  });

describe("the account-link prompt", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
    openLinkModal.mockReset();
  });

  it("stays quiet on mount while the instance is unlinked", () => {
    render(<Probe />);
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it("leaves pending failures for the active dialog host", () => {
    const view = render(<Probe enabled={false} />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    expect(openLinkModal).not.toHaveBeenCalled();
    view.rerender(<Probe />);
    expect(openLinkModal).toHaveBeenCalledExactlyOnceWith("exhausted");
  });

  it("opens on the allowance pitch when the grant is reported spent", () => {
    render(<Probe />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
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
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    expect(openLinkModal).not.toHaveBeenCalled();
  });

  it("coalesces concurrent failures and stays quiet after dismissal and remount", () => {
    const first = render(<Probe />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    first.unmount();
    render(<Probe />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    expect(openLinkModal).toHaveBeenCalledTimes(1);
  });

  it("prompts once for background failures and suppresses subsequent foreground failures", () => {
    render(<Probe />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"), "background");
    });
    expect(openLinkModal).toHaveBeenCalledExactlyOnceWith("exhausted");
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    expect(openLinkModal).toHaveBeenCalledTimes(1);
  });

  it("keeps the session suppression after credits recover", () => {
    render(<Probe />);
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    act(() => {
      clearAccountLinkBlock();
    });
    act(() => {
      reportAccountLinkBlock(blocked("FREE_TIER_EXHAUSTED"));
    });
    expect(openLinkModal).toHaveBeenCalledTimes(1);
  });
});
