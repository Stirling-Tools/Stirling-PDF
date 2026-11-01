import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";
import { useFooterInfo } from "@editor/hooks/useFooterInfo";
import { fetchFooterInfo } from "@editor/api/config";

vi.mock("@editor/api/config", () => ({ fetchFooterInfo: vi.fn() }));

const mockFetch = vi.mocked(fetchFooterInfo);

describe("useFooterInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the server's footer config", async () => {
    mockFetch.mockResolvedValue({
      analyticsEnabled: true,
      privacyPolicy: "/privacy",
    });

    const { result } = renderHook(() => useFooterInfo(), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.footerInfo).toEqual({
      analyticsEnabled: true,
      privacyPolicy: "/privacy",
    });
  });

  it("falls back to analytics-off rather than null when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useFooterInfo(), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.footerInfo).toEqual({ analyticsEnabled: false });
  });

  it("shares one request between the footer and the legal section", async () => {
    mockFetch.mockResolvedValue({ analyticsEnabled: false });

    const { result } = renderHook(
      () => ({ footer: useFooterInfo(), legal: useFooterInfo() }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.footer.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
