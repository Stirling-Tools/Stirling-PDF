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

  it("maps the backend ranking to known tool ids, keeping the score order", async () => {
    mockFetch.mockResolvedValue([
      { toolKey: "ocr", score: 5 },
      { toolKey: "definitelyNotATool", score: 4 },
      { toolKey: "merge", score: 3 },
    ]);

    const { result } = renderHook(() => useToolRecommendations(), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() =>
      expect(result.current.recommendedToolIds).toEqual(["ocr", "merge"]),
    );
  });

  it("reports null when the backend is unavailable (static fallback)", async () => {
    mockFetch.mockResolvedValue(null);

    const { result } = renderHook(() => useToolRecommendations(), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current.recommendedToolIds).toBeNull();
  });

  it("reports null on a cold start with no usage data", async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useToolRecommendations(), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current.recommendedToolIds).toBeNull();
  });

  it("asks for recommendations in the context of the last completed tool", async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useToolRecommendations(), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(null, 8));

    act(() =>
      notifyToolCompleted({
        toolId: "compare",
        inputs: [],
        outputFileIds: [],
      }),
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("compare", 8));
    expect(result.current.contextTool).toBe("compare");
  });
});
