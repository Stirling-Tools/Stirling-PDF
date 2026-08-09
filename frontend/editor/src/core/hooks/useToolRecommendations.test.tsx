import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { qk } from "@app/query/keys";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import {
  fetchToolRecommendations,
  dismissToolRecommendation,
  undoDismissToolRecommendation,
} from "@app/api/toolRecommendations";
import {
  useDismissToolRecommendation,
  useToolRecommendations,
} from "@app/hooks/useToolRecommendations";
import {
  notifyToolCompleted,
  resetToolUsageTrackerForTests,
} from "@app/services/toolUsageTracker";

vi.mock("@app/api/toolRecommendations", () => ({
  ANY_CONTEXT: "*",
  fetchToolRecommendations: vi.fn(),
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
  dismissToolRecommendation: vi.fn(),
  undoDismissToolRecommendation: vi.fn(),
}));

const mockFetch = vi.mocked(fetchToolRecommendations);
const mockDismiss = vi.mocked(dismissToolRecommendation);
const mockUndo = vi.mocked(undoDismissToolRecommendation);

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

    act(() => notifyToolCompleted("compare"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("compare", 8));
    expect(result.current.contextTool).toBe("compare");
  });
});

describe("useDismissToolRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolUsageTrackerForTests();
  });

  it("persists the dismissal and returns a working undo", async () => {
    mockDismiss.mockResolvedValue(undefined);
    mockUndo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDismissToolRecommendation(), {
      wrapper: TestQueryProvider,
    });

    const undo = await result.current("compare", "ocr");
    expect(mockDismiss).toHaveBeenCalledWith("compare", "ocr");

    await undo();
    expect(mockUndo).toHaveBeenCalledWith("compare", "ocr");
  });

  it("propagates failures so callers can surface an error toast", async () => {
    mockDismiss.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useDismissToolRecommendation(), {
      wrapper: TestQueryProvider,
    });

    await expect(result.current(null, "ocr")).rejects.toThrow("boom");
  });

  it("a failing undo rejects so the caller can report it", async () => {
    mockDismiss.mockResolvedValue(undefined);
    mockUndo.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useDismissToolRecommendation(), {
      wrapper: TestQueryProvider,
    });

    const undo = await result.current("compare", "ocr");
    await expect(undo()).rejects.toThrow("offline");
  });

  it("optimistically hides the tool only in the context it was dismissed from", async () => {
    mockFetch.mockImplementation(async (context) =>
      context === "compare"
        ? [
            { toolKey: "ocr", score: 5 },
            { toolKey: "merge", score: 3 },
          ]
        : [{ toolKey: "ocr", score: 4 }],
    );
    mockDismiss.mockResolvedValue(undefined);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    // Populate both a "compare" context list and the no-context list.
    await client.fetchQuery({
      queryKey: qk.toolRecommendations("compare", 8),
      queryFn: () => fetchToolRecommendations("compare", 8),
    });
    await client.fetchQuery({
      queryKey: qk.toolRecommendations("*", 8),
      queryFn: () => fetchToolRecommendations(null, 8),
    });

    const { result } = renderHook(() => useDismissToolRecommendation(), {
      wrapper,
    });
    await result.current("compare", "ocr");

    expect(client.getQueryData(qk.toolRecommendations("compare", 8))).toEqual([
      { toolKey: "merge", score: 3 },
    ]);
    // The other context keeps its entry: this dismissal does not apply there.
    expect(client.getQueryData(qk.toolRecommendations("*", 8))).toEqual([
      { toolKey: "ocr", score: 4 },
    ]);
  });
});
