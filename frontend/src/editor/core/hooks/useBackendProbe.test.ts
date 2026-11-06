import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBackendProbe } from "@editor/hooks/useBackendProbe";

function backendResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body ?? null,
  } as unknown as Response;
}

describe("useBackendProbe", () => {
  it("resolves a superseded probe with no result", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/info/status")) {
          return new Promise<Response>((resolve) => pending.push(resolve));
        }
        // The login fallback only runs when the status probe is not up.
        return Promise.resolve(backendResponse(500));
      }),
    );

    const { result } = renderHook(() => useBackendProbe());
    await act(async () => {
      pending.shift()?.(backendResponse(200, { status: "UP" }));
    });
    expect(result.current.status).toBe("up");

    const slow = result.current.probe();
    const fast = result.current.probe();
    await act(async () => {
      // The newer probe answers first and applies its own state.
      pending[1]?.(backendResponse(500));
    });
    await act(async () => {
      // The older probe settles last with a stale "up"; it must not surface it
      // to callers, or Landing would navigate on a status the newer probe
      // already contradicted.
      pending[0]?.(backendResponse(200, { status: "UP" }));
    });

    expect(await fast).toMatchObject({ status: "down" });
    expect(await slow).toBeUndefined();
    expect(result.current.status).toBe("down");
    vi.unstubAllGlobals();
  });
});
