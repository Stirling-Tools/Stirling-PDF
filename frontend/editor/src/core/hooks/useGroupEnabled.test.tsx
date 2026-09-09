import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { useGroupEnabled } from "@app/hooks/useGroupEnabled";
import { fetchGroupEnabled } from "@app/api/config";

vi.mock("@app/api/config", () => ({ fetchGroupEnabled: vi.fn() }));

const mockFetch = vi.mocked(fetchGroupEnabled);

describe("useGroupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports null while loading, then the server's answer", async () => {
    mockFetch.mockResolvedValue(true);

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.enabled).toBeNull();
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("ImageMagick");
  });

  it("reads a failed check as disabled", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("serves a second consumer of the same group from cache", async () => {
    mockFetch.mockResolvedValue(true);

    const { result } = renderHook(
      () => ({
        a: useGroupEnabled("ImageMagick"),
        b: useGroupEnabled("ImageMagick"),
      }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.a.enabled).toBe(true));
    expect(result.current.b.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct groups on distinct keys", async () => {
    mockFetch.mockImplementation((group: string) =>
      Promise.resolve(group === "ImageMagick"),
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
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
