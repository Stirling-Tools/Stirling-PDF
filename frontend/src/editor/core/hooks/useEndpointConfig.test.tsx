import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import {
  useEndpointEnabled,
  useMultipleEndpointsEnabled,
} from "@app/hooks/useEndpointConfig";
import {
  fetchEndpointEnabled,
  fetchEndpointsAvailability,
} from "@app/api/config";

vi.mock("@app/api/config", () => ({
  fetchEndpointEnabled: vi.fn(),
  fetchEndpointsAvailability: vi.fn(),
}));

const mockOne = vi.mocked(fetchEndpointEnabled);
const mockAll = vi.mocked(fetchEndpointsAvailability);

describe("useEndpointEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports null while loading, then the server's answer", async () => {
    mockOne.mockResolvedValue(false);

    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.enabled).toBeNull();
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("stays null on failure rather than claiming disabled", async () => {
    mockOne.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.enabled).toBeNull();
  });

  it("does not fetch without an endpoint", () => {
    const { result } = renderHook(() => useEndpointEnabled(""), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.loading).toBe(false);
    expect(mockOne).not.toHaveBeenCalled();
  });
});

describe("useMultipleEndpointsEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("projects the shared map onto the requested endpoints", async () => {
    mockAll.mockResolvedValue({
      "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
      "add-stamp": { enabled: true, reason: null },
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["ocr-pdf"]),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({ "ocr-pdf": false }),
    );
    expect(result.current.endpointDetails["ocr-pdf"].reason).toBe("DEPENDENCY");
  });

  it("serves every consumer from one request", async () => {
    mockAll.mockResolvedValue({ "ocr-pdf": { enabled: true, reason: null } });

    const { result } = renderHook(
      () => ({
        a: useMultipleEndpointsEnabled(["ocr-pdf"]),
        b: useMultipleEndpointsEnabled(["ocr-pdf", "add-stamp"]),
      }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(mockAll).toHaveBeenCalledTimes(1);
  });

  it("treats unknown endpoints as enabled", async () => {
    mockAll.mockResolvedValue({});

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["brand-new-tool"]),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({ "brand-new-tool": true }),
    );
  });

  it("falls back to enabled when the check fails", async () => {
    mockAll.mockRejectedValue(
      Object.assign(new Error("unauthorised"), { response: { status: 401 } }),
    );

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["ocr-pdf", "add-stamp"]),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({
        "ocr-pdf": true,
        "add-stamp": true,
      }),
    );
    // The fallback is the answer, so no retry.
    expect(mockAll).toHaveBeenCalledTimes(1);
  });

  it("does not fetch for an empty endpoint list", () => {
    const { result } = renderHook(() => useMultipleEndpointsEnabled([]), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.loading).toBe(false);
    expect(mockAll).not.toHaveBeenCalled();
  });

  it("refetches when a JWT becomes available", async () => {
    mockAll.mockResolvedValue({ "ocr-pdf": { enabled: true, reason: null } });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["ocr-pdf"]),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      window.dispatchEvent(new CustomEvent("jwt-available"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(mockAll).toHaveBeenCalledTimes(2));
  });
});
