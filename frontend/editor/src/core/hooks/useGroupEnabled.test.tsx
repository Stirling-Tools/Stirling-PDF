import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@app/testing/TestQueryProvider";
import { useGroupEnabled } from "@app/hooks/useGroupEnabled";
import apiClient from "@app/services/apiClient";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);

describe("useGroupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports null while loading, then the server's answer", async () => {
    mockGet.mockResolvedValue({ data: true } as never);

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.enabled).toBeNull();
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      "/api/v1/config/group-enabled?group=ImageMagick",
    );
  });

  it("reads a failed check as disabled", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("serves a second consumer of the same group from cache", async () => {
    mockGet.mockResolvedValue({ data: true } as never);

    const { result } = renderHook(
      () => ({
        a: useGroupEnabled("ImageMagick"),
        b: useGroupEnabled("ImageMagick"),
      }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.a.enabled).toBe(true));
    expect(result.current.b.enabled).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct groups on distinct keys", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith("ImageMagick") } as never),
    );

    const { result } = renderHook(
      () => ({
        magick: useGroupEnabled("ImageMagick"),
        calibre: useGroupEnabled("Calibre"),
      }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.magick.enabled).toBe(true));
    await waitFor(() => expect(result.current.calibre.enabled).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
