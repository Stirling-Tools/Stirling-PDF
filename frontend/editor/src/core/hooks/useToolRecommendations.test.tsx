import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { fetchToolRecommendations } from "@app/api/toolRecommendations";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import {
  notifyToolCompleted,
  resetToolUsageTrackerForTests,
} from "@app/services/toolUsageTracker";

vi.mock("@app/api/toolRecommendations", () => ({
  fetchToolRecommendations: vi.fn(),
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.mocked(fetchToolRecommendations);

describe("useToolRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolUsageTrackerForTests();
  });

  it("returns the backend ranking with its scores intact", async () => {
    const ranking = [
      { toolKey: "ocr", score: 5 },
      { toolKey: "merge", score: 3 },
    ];
    mockFetch.mockResolvedValue(ranking);

    const { result } = renderHook(() => useToolRecommendations(null), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() =>
      expect(result.current.recommendations).toEqual(ranking),
    );
  });

  it("reports null when the backend is unavailable (static fallback)", async () => {
    mockFetch.mockResolvedValue(null);

    const { result } = renderHook(() => useToolRecommendations(null), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current.recommendations).toBeNull();
  });

  it("reports null on a cold start with no usage data", async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useToolRecommendations(null), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current.recommendations).toBeNull();
  });

  it("asks in the context of the tool that is asking, not the last one to run", async () => {
    mockFetch.mockResolvedValue([]);

    renderHook(() => useToolRecommendations("split"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("split", 8));
  });

  it("refetches once a tool completes, since that run is the newest evidence", async () => {
    mockFetch.mockResolvedValue([]);

    renderHook(() => useToolRecommendations("compare"), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    act(() =>
      notifyToolCompleted({
        toolId: "compare",
        inputs: [],
        outputFileIds: [],
      }),
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith("compare", 8);
  });
});
