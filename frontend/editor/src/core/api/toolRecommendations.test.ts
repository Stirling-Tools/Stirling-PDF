import { describe, it, expect, vi, beforeEach } from "vitest";

import apiClient from "@app/services/apiClient";
import {
  fetchToolRecommendations,
  recordToolUsage,
  dismissToolRecommendation,
  undoDismissToolRecommendation,
  resetToolRecommendationsAvailabilityForTests,
} from "@app/api/toolRecommendations";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockDelete = vi.mocked(apiClient.delete);

const http404 = Object.assign(new Error("not found"), {
  response: { status: 404 },
});

describe("toolRecommendations api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolRecommendationsAvailabilityForTests();
  });

  describe("fetchToolRecommendations", () => {
    it("returns the ranked list and passes the current tool", async () => {
      mockGet.mockResolvedValue({
        data: { recommendations: [{ toolKey: "ocr", score: 5 }] },
      });

      const result = await fetchToolRecommendations("compare", 6);

      expect(result).toEqual([{ toolKey: "ocr", score: 5 }]);
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain("currentTool=compare");
      expect(url).toContain("limit=6");
    });

    it("omits currentTool when there is no context", async () => {
      mockGet.mockResolvedValue({ data: { recommendations: [] } });

      await fetchToolRecommendations(null);

      expect(mockGet.mock.calls[0][0]).not.toContain("currentTool");
    });

    it("returns null on failure so callers fall back to the static list", async () => {
      mockGet.mockRejectedValue(new Error("network down"));

      expect(await fetchToolRecommendations("compare")).toBeNull();
    });

    it("remembers a 404 and stops calling a backend without the API", async () => {
      mockGet.mockRejectedValue(http404);

      expect(await fetchToolRecommendations("compare")).toBeNull();
      expect(await fetchToolRecommendations("compare")).toBeNull();
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it("keeps retrying after transient failures (no 404 latch)", async () => {
      mockGet.mockRejectedValue(new Error("network down"));

      await fetchToolRecommendations("compare");
      await fetchToolRecommendations("compare");

      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  describe("recordToolUsage", () => {
    it("posts the tool and its predecessor", async () => {
      mockPost.mockResolvedValue({});

      await recordToolUsage("ocr", "compare");

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining("/usage"),
        { toolKey: "ocr", previousToolKey: "compare" },
        expect.objectContaining({ suppressErrorToast: true }),
      );
    });

    it("swallows failures silently", async () => {
      mockPost.mockRejectedValue(new Error("boom"));

      await expect(recordToolUsage("ocr")).resolves.toBeUndefined();
    });

    it("skips the network entirely once the API is known to be missing", async () => {
      mockPost.mockRejectedValue(http404);

      await recordToolUsage("ocr");
      await recordToolUsage("ocr");

      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  describe("dismissals", () => {
    it("posts a context-scoped dismissal", async () => {
      mockPost.mockResolvedValue({});

      await dismissToolRecommendation("compare", "ocr");

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining("/dismissals"),
        { contextTool: "compare", dismissedTool: "ocr" },
        expect.objectContaining({ suppressErrorToast: true }),
      );
    });

    it("maps a null context to the any-context wildcard", async () => {
      mockPost.mockResolvedValue({});

      await dismissToolRecommendation(null, "ocr");

      expect(mockPost.mock.calls[0][1]).toEqual({
        contextTool: "*",
        dismissedTool: "ocr",
      });
    });

    it("undo issues a delete with the same coordinates", async () => {
      mockDelete.mockResolvedValue({});

      await undoDismissToolRecommendation("compare", "ocr");

      const url = mockDelete.mock.calls[0][0] as string;
      expect(url).toContain("contextTool=compare");
      expect(url).toContain("dismissedTool=ocr");
    });

    it("propagates dismissal failures so the UI can warn the user", async () => {
      mockPost.mockRejectedValue(new Error("boom"));

      await expect(dismissToolRecommendation("compare", "ocr")).rejects.toThrow(
        "boom",
      );
    });
  });
});
