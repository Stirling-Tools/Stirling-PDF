import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@app/query/queryClient";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";
import {
  useFormDetectionModelStatus,
  type FormDetectionModelStatus,
} from "@app/hooks/useFormDetectionModelStatus";

const POLL_MS = 1500;

function statusPayload(
  enabled: boolean,
  status: FormDetectionModelStatus["status"] = "ready",
): FormDetectionModelStatus {
  return {
    status,
    progress: 100,
    activeModelId: "test-model",
    installed: ["test-model"],
    error: null,
    writable: true,
    catalog: [],
    enabled,
    serverEngineAvailable: true,
  };
}

let hook: ReturnType<typeof useFormDetectionModelStatus> | null = null;

function Probe() {
  hook = useFormDetectionModelStatus();
  return (
    <span data-testid="enabled">
      {hook.status ? String(hook.status.enabled) : "loading"}
    </span>
  );
}

/** The app's own defaults, so a test can't pass on a library default the app overrides. */
function mountWithAppDefaults() {
  const client = createAppQueryClient();
  const el = render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  ).getByTestId("enabled");
  return { client, el };
}

/** One poll's worth of time, plus the microtasks its response resolves through. */
async function polls(count: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * count);
  });
}

describe("useFormDetectionModelStatus", () => {
  beforeEach(() => {
    hook = null;
    (apiClient.get as Mock).mockReset();
    (apiClient.post as Mock).mockReset().mockResolvedValue({ data: {} });
    (apiClient.delete as Mock).mockReset().mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    resetTabVisibility();
    vi.useRealTimers();
  });

  it("refreshes the tool availability cache when the master switch flips", async () => {
    // The endpoint is re-gated server-side on toggle without the wire status changing,
    // so an effect keyed only on status would leave the tile clickable until a reload.
    (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(true) });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const el = render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ).getByTestId("enabled");
    await waitFor(() => expect(el.textContent).toBe("true"));

    invalidate.mockClear();
    (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(false) });
    await act(async () => {
      await hook!.setConfig({ enabled: false });
    });

    await waitFor(() => expect(el.textContent).toBe("false"));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: qk.endpointsAvailability(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: qk.endpointEnabled("form-detection"),
    });
  });

  it("surfaces a load failure rather than sitting on the spinner", async () => {
    (apiClient.get as Mock).mockRejectedValue(new Error("backend down"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(hook!.error).toBe("backend down"));
    expect(hook!.loading).toBe(false);
  });

  it("reports a failed write to the caller", async () => {
    (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(true) });
    (apiClient.post as Mock).mockRejectedValue(new Error("install refused"));
    const { el } = mountWithAppDefaults();
    await waitFor(() => expect(el.textContent).toBe("true"));

    await expect(hook!.install("m1")).rejects.toThrow("install refused");
  });

  it("carries the re-read with the write rather than after it", async () => {
    (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(true) });
    const { el } = mountWithAppDefaults();
    await waitFor(() => expect(el.textContent).toBe("true"));
    expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);

    (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(false) });
    await act(async () => {
      await hook!.uninstall("m1");
    });

    // The status request is already spent when the write resolves; React commits
    // the result a tick later, so the count - not the DOM - is what proves it.
    expect(apiClient.get as Mock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(el.textContent).toBe("false"));
    expect(apiClient.get as Mock).toHaveBeenCalledTimes(2);
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it("reads repeatedly while a download is in flight", async () => {
      (apiClient.get as Mock).mockResolvedValue({
        data: statusPayload(true, "downloading"),
      });
      mountWithAppDefaults();
      await polls(0);
      expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);

      await polls(3);

      expect(apiClient.get as Mock).toHaveBeenCalledTimes(4);
    });

    it("does not poll once the model has settled", async () => {
      (apiClient.get as Mock).mockResolvedValue({ data: statusPayload(true) });
      mountWithAppDefaults();
      await polls(0);

      await polls(10);

      expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);
    });

    it("stops reading while the tab is hidden, and resumes on the next tick", async () => {
      (apiClient.get as Mock).mockResolvedValue({
        data: statusPayload(true, "downloading"),
      });
      mountWithAppDefaults();
      await polls(0);
      expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);

      setTabHidden(true);
      await polls(20);
      expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);

      setTabHidden(false);
      await polls(1);
      expect(apiClient.get as Mock).toHaveBeenCalledTimes(2);
    });
  });
});
