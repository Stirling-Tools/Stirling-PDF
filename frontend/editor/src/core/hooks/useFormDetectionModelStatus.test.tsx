import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";
import {
  useFormDetectionModelStatus,
  type FormDetectionModelStatus,
} from "@app/hooks/useFormDetectionModelStatus";

function statusPayload(enabled: boolean): FormDetectionModelStatus {
  return {
    status: "ready",
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

describe("useFormDetectionModelStatus", () => {
  beforeEach(() => {
    hook = null;
    (apiClient.get as Mock).mockReset();
    (apiClient.post as Mock).mockReset().mockResolvedValue({ data: {} });
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
});
