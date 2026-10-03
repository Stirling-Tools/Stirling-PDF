import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { DesktopQueryCacheReset } from "@app/components/DesktopQueryCacheReset";

type Listener = (config: { mode: string }) => void;
type ServerListener = (state: { status: string }) => void;

const modeListeners = new Set<Listener>();
const serverListeners = new Set<ServerListener>();

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    subscribeToModeChanges: (listener: Listener) => {
      modeListeners.add(listener);
      return () => modeListeners.delete(listener);
    },
  },
}));

vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    subscribe: (listener: ServerListener) => {
      serverListeners.add(listener);
      listener({ status: "online" }); // matches the real replay-on-attach
      return () => serverListeners.delete(listener);
    },
  },
}));

function renderWithConsumer(queryFn: () => Promise<string>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const seen: (string | undefined)[] = [];

  function Consumer() {
    const { data } = useQuery({ queryKey: ["editor", "probe"], queryFn });
    seen.push(data);
    return <span>{data ?? "pending"}</span>;
  }

  render(
    <QueryClientProvider client={client}>
      <DesktopQueryCacheReset />
      <Consumer />
    </QueryClientProvider>,
  );
  return seen;
}

describe("DesktopQueryCacheReset", () => {
  beforeEach(() => {
    modeListeners.clear();
    serverListeners.clear();
  });

  it("refetches a mounted query when the connection mode changes", async () => {
    const queryFn = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("local-backend")
      .mockResolvedValueOnce("self-hosted-backend");

    const seen = renderWithConsumer(queryFn);
    await waitFor(() => expect(seen).toContain("local-backend"));

    modeListeners.forEach((l) => l({ mode: "selfhosted" }));

    // Must refetch, not just evict — this is what clear() got wrong.
    await waitFor(() => expect(seen).toContain("self-hosted-backend"));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("refetches when the self-hosted server flips online/offline", async () => {
    const queryFn = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("server")
      .mockResolvedValueOnce("local-fallback");

    const seen = renderWithConsumer(queryFn);
    await waitFor(() => expect(seen).toContain("server"));

    serverListeners.forEach((l) => l({ status: "offline" }));

    await waitFor(() => expect(seen).toContain("local-fallback"));
  });

  it("ignores the replayed state the monitor emits on subscribe", async () => {
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue("once");

    renderWithConsumer(queryFn);
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("resets on recovery, not on the checking state in between", async () => {
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue("x");

    renderWithConsumer(queryFn);
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    const emit = (status: string) =>
      serverListeners.forEach((l) => l({ status }));

    emit("offline");
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    // A monitor restart while still down must not read as recovery — otherwise
    // the reset lands here and the real online transition is skipped.
    emit("checking");
    expect(queryFn).toHaveBeenCalledTimes(2);

    emit("online");
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(3));
  });

  it("does not reset when the monitor stops while offline", async () => {
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue("cached");

    renderWithConsumer(queryFn);
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    serverListeners.forEach((l) => l({ status: "offline" }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    serverListeners.forEach((l) => l({ status: "idle" }));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
