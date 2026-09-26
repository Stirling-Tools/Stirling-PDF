import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";
import { qk } from "@app/portal/queries/keys";
import { useLocalUsageSync } from "@app/portal/hooks/useLocalUsageSync";

const triggerLocalSync = vi.fn();
vi.mock("@app/portal/api/link", () => ({
  triggerLocalSync: () => triggerLocalSync(),
}));
const refreshWalletCache = vi.fn();
vi.mock("@app/portal/api/billing", () => ({
  refreshWalletCache: () => refreshWalletCache(),
}));

function Probe({ enabled }: { enabled: boolean }) {
  useLocalUsageSync(enabled);
  return null;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
}

function renderFor(enabled: boolean, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Probe enabled={enabled} />
    </QueryClientProvider>,
  );
}

/** Settles the hook's own query, so a count can't pass by being taken too early. */
async function settled(client: QueryClient) {
  await waitFor(() =>
    expect(client.getQueryState(qk.localSync())?.status).not.toBe("pending"),
  );
}

describe("useLocalUsageSync", () => {
  beforeEach(() => {
    triggerLocalSync.mockReset().mockResolvedValue(true);
    refreshWalletCache.mockReset().mockResolvedValue(undefined);
  });

  it("reports local usage and drops the cached wallet when the page opens", async () => {
    const client = newClient();
    renderFor(true, client);

    await waitFor(() => expect(triggerLocalSync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refreshWalletCache).toHaveBeenCalledTimes(1));
  });

  it("marks the wallet and local-usage reads stale so the page re-reads them", async () => {
    const client = newClient();
    // Seed both so invalidation has something to act on; an empty cache would pass
    // this vacuously whether or not the hook invalidated anything.
    client.setQueryData(qk.wallet(true), { status: "free" });
    client.setQueryData(qk.localUsage(), { totalUnsyncedUnits: 12 });
    renderFor(true, client);

    await waitFor(() => {
      expect(client.getQueryState(qk.wallet(true))?.isInvalidated).toBe(true);
      expect(client.getQueryState(qk.localUsage())?.isInvalidated).toBe(true);
    });
  });

  it("does nothing on hosted SaaS, which has no instance to sync", async () => {
    renderFor(false, newClient());

    await Promise.resolve();
    expect(triggerLocalSync).not.toHaveBeenCalled();
  });

  it("does not ask again when the page is reopened inside the window", async () => {
    const client = newClient();
    const first = renderFor(true, client);
    await waitFor(() => expect(triggerLocalSync).toHaveBeenCalledTimes(1));
    first.unmount();

    renderFor(true, client);

    await settled(client);
    expect(triggerLocalSync).toHaveBeenCalledTimes(1);
  });

  // A throttled backend reports nothing, so there is no snapshot worth dropping and
  // nothing downstream to re-read. This is what keeps a reload loop off SaaS entirely.
  it("leaves the wallet alone when the backend throttled the sync", async () => {
    triggerLocalSync.mockResolvedValue(false);
    const client = newClient();
    client.setQueryData(qk.wallet(true), { status: "free" });
    renderFor(true, client);

    await settled(client);
    expect(triggerLocalSync).toHaveBeenCalledTimes(1);
    expect(refreshWalletCache).not.toHaveBeenCalled();
    expect(client.getQueryState(qk.wallet(true))?.isInvalidated).toBe(false);
  });

  it("re-reads the wallet even when its cached snapshot could not be dropped", async () => {
    refreshWalletCache.mockRejectedValue(new Error("session lapsed"));
    const client = newClient();
    client.setQueryData(qk.wallet(true), { status: "free" });
    renderFor(true, client);

    await waitFor(() =>
      expect(client.getQueryState(qk.wallet(true))?.isInvalidated).toBe(true),
    );
  });

  it("leaves the page alone when the instance cannot sync", async () => {
    triggerLocalSync.mockRejectedValue(new Error("unreachable"));
    const client = newClient();
    client.setQueryData(qk.wallet(true), { status: "free" });
    renderFor(true, client);

    await waitFor(() =>
      expect(client.getQueryState(qk.localSync())?.status).toBe("error"),
    );
    expect(refreshWalletCache).not.toHaveBeenCalled();
    expect(client.getQueryState(qk.wallet(true))?.isInvalidated).toBe(false);
  });
});
