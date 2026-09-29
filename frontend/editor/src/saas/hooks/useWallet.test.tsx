import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@app/services/billing", () => ({ createPortalSession: vi.fn() }));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));
vi.mock("@app/hooks/walletDevPreview", () => ({
  getWalletDevPreview: () => null,
}));

import apiClient from "@app/services/apiClient";
import { createAppQueryClient } from "@app/query/queryClient";
// The saas cascade resolves this to cloud/hooks/useWallet, the build that ships
// it; cloud/ has no test project of its own.
import { useWallet, type Wallet } from "@app/hooks/useWallet";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";
import { expectConsole } from "@app/tests/failOnConsole";

const POLL_MS = 30_000;
const get = vi.mocked(apiClient.get);

function wallet(over: Partial<Wallet> = {}): Wallet {
  return {
    status: "free",
    teamId: 1,
    role: "leader",
    billingPeriodStart: "2026-09-01",
    billingPeriodEnd: "2026-10-01",
    billableUsed: 0,
    billableLimit: 0,
    freeAllowance: 500,
    freeRemaining: 500,
    includedPeriodStart: null,
    includedPeriodEnd: null,
    pricePerDocMinor: 1,
    bundleRatePerCreditMinor: null,
    currency: "usd",
    estimatedBillMinor: 0,
    capUsd: null,
    noCap: true,
    stripeSubscriptionId: null,
    spendUnitsThisPeriod: 0,
    docsProcessedThisPeriod: 0,
    uniquePdfsThisPeriod: 0,
    sizeMultiplierPdfsThisPeriod: 0,
    billingMode: "payg",
    prepaidUnitsRemaining: null,
    prepaidUnitsTotal: null,
    prepaidExpiresAt: null,
    freeUserAllowance: 5,
    categoryBreakdown: { api: 0, ai: 0, automation: 0 },
    categoryDocs: { api: 0, ai: 0, automation: 0 },
    members: [],
    recent: [],
    team: { held: false, licensedUsers: null, usersInUse: 1 },
    processor: { active: false },
    ...over,
  } as unknown as Wallet;
}

let hook: ReturnType<typeof useWallet> | null = null;

function Probe({ enabled = true }: { enabled?: boolean }) {
  hook = useWallet(enabled);
  // Renders a nested field too, so a test can tell whether a change to one
  // actually reaches a consumer.
  return (
    <span data-testid="s">
      {hook.wallet?.status ?? "none"}/
      {String(hook.wallet?.processor?.active ?? "?")}
    </span>
  );
}

/** Mounts with the first read already landed, so nothing settles outside act. */
async function mount(ui: ReactNode) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <QueryClientProvider client={createAppQueryClient()}>
        {ui}
      </QueryClientProvider>,
    );
  });
  await settle();
  return view;
}

/**
 * Flushes until the read has been applied. The cache notifies on a scheduled
 * batch, and the render it triggers only lands on the following turn, so this
 * needs several separate acts rather than one long one.
 */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function polls(count: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * count);
  });
  // Separate turn: the notification the advance scheduled lands here.
  await settle();
}

beforeEach(() => {
  hook = null;
  get.mockReset().mockResolvedValue({ data: wallet() });
  vi.mocked(apiClient.post).mockReset().mockResolvedValue({ data: {} });
  vi.mocked(apiClient.patch).mockReset().mockResolvedValue({ data: {} });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  // Unmount first: restoring real timers under a mounted consumer lets its poll
  // fire outside act, and the warning lands on whichever test runs next.
  cleanup();
  resetTabVisibility();
  vi.useRealTimers();
});

it("reads the wallet on mount", async () => {
  await mount(<Probe />);

  expect(hook!.wallet).not.toBeNull();
  expect(hook!.loading).toBe(false);
  expect(get).toHaveBeenCalledWith("/api/v1/payg/wallet", {
    suppressErrorToast: true,
  });
});

it("re-reads on a schedule, and stops while the tab is hidden", async () => {
  await mount(<Probe />);
  await polls(2);
  const visible = get.mock.calls.length;
  expect(visible).toBeGreaterThan(1);

  setTabHidden(true);
  await polls(10);

  expect(get).toHaveBeenCalledTimes(visible);
});

describe("background refreshes are silent", () => {
  it("does not raise loading on a background tick", async () => {
    await mount(<Probe />);

    let raised = false;
    const watch = setInterval(() => {
      if (hook?.loading) raised = true;
    }, 10);
    await polls(3);
    clearInterval(watch);

    expect(raised).toBe(false);
  });

  it("keeps the last good snapshot when a background read fails", async () => {
    await mount(<Probe />);
    const held = hook!.wallet;

    get.mockRejectedValue(new Error("offline"));
    await polls(2);

    // A failed background refresh is a non-event: the figures still stand, and
    // it never logs, or an offline tab would warn on every tick.
    expect(hook!.wallet).toBe(held);
    expect(hook!.error).toBeNull();
  });

  it("surfaces a failure that leaves nothing to show", async () => {
    get.mockRejectedValue(new Error("no wallet"));
    expectConsole.warn(/\[useWallet\] fetch failed/);
    await mount(<Probe />);

    expect(hook!.error).toBe("no wallet");
    expect(hook!.loading).toBe(false);
    expect(hook!.wallet).toBeNull();
  });

  it("retires an earlier failure once fresh data lands", async () => {
    get.mockRejectedValue(new Error("no wallet"));
    expectConsole.warn(/\[useWallet\] fetch failed/);
    await mount(<Probe />);
    expect(hook!.error).toBe("no wallet");

    get.mockResolvedValue({ data: wallet() });
    await act(async () => {
      await hook!.refetch();
    });
    await settle();

    expect(hook!.error).toBeNull();
    expect(hook!.wallet).not.toBeNull();
  });
});

describe("snapshot identity", () => {
  it("reuses the snapshot when the payload has not changed", async () => {
    await mount(<Probe />);
    const first = hook!.wallet;

    await polls(3);

    expect(hook!.wallet).toBe(first);
  });

  it("shows a change confined to a nested field", async () => {
    const view = await mount(<Probe />);
    expect(view.getByTestId("s")).toHaveTextContent("free/false");

    // processor / team / freeUserAllowance sat outside the hand-written field
    // list, so a change to one of them never reached a consumer.
    get.mockResolvedValue({ data: wallet({ processor: { active: true } }) });
    await polls(1);

    await waitFor(() =>
      expect(view.getByTestId("s")).toHaveTextContent("free/true"),
    );
  });
});

describe("mutations", () => {
  it("resolves updateCap only once the new state is in hand", async () => {
    await mount(<Probe />);
    const reads = get.mock.calls.length;

    get.mockResolvedValue({ data: wallet({ capUsd: 25, noCap: false }) });
    await act(async () => {
      await hook!.updateCap(25);
    });
    await settle();

    expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/payg/cap", {
      capUsd: 25,
      noCap: false,
    });
    expect(get.mock.calls.length).toBeGreaterThan(reads);
    expect(hook!.wallet?.capUsd).toBe(25);
  });

  it("treats a missing dev mark-subscribed hook as normal", async () => {
    await mount(<Probe />);
    vi.mocked(apiClient.post).mockRejectedValue({ response: { status: 404 } });

    await act(async () => {
      await expect(hook!.markSubscribed(null)).resolves.toBeUndefined();
    });
  });

  it("reports any other mark-subscribed failure", async () => {
    await mount(<Probe />);
    vi.mocked(apiClient.post).mockRejectedValue({ response: { status: 500 } });

    await expect(hook!.markSubscribed(null)).rejects.toBeTruthy();
  });
});

it("stops reading and shows nothing when disabled", async () => {
  await mount(<Probe enabled={false} />);
  await polls(3);

  expect(get).not.toHaveBeenCalled();
  expect(hook!.wallet).toBeNull();
  expect(hook!.loading).toBe(false);
});

it("keeps its callbacks stable across re-renders", async () => {
  const view = await mount(<Probe />);
  const before = {
    refetch: hook!.refetch,
    updateCap: hook!.updateCap,
    markSubscribed: hook!.markSubscribed,
  };

  await act(async () => {
    view.rerender(
      <QueryClientProvider client={createAppQueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
  });

  expect(hook!.refetch).toBe(before.refetch);
  expect(hook!.updateCap).toBe(before.updateCap);
  expect(hook!.markSubscribed).toBe(before.markSubscribed);
});
