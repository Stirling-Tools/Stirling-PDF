import { describe, it, expect, vi, beforeEach } from "vitest";

import apiClient from "@app/services/apiClient";
import {
  fetchToolRecommendations,
  fetchToolWorkflows,
  recordToolUsage,
  resetToolRecommendationsAvailabilityForTests,
} from "@app/api/toolRecommendations";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

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

  describe("fetchToolWorkflows", () => {
    it("returns repeated workflows and passes the filters", async () => {
      mockGet.mockResolvedValue({
        data: {
          workflows: [
            { tools: ["compress", "watermark"], count: 4, scope: "USER" },
          ],
        },
      });

      const result = await fetchToolWorkflows(3, 10);

      expect(result).toEqual([
        { tools: ["compress", "watermark"], count: 4, scope: "USER" },
      ]);
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain("minLength=3");
      expect(url).toContain("limit=10");
    });

    it("returns null on failure", async () => {
      mockGet.mockRejectedValue(new Error("network down"));

      expect(await fetchToolWorkflows()).toBeNull();
    });
  });

  describe("recordToolUsage", () => {
    it("posts the tool and each input document's prior chain", async () => {
      mockPost.mockResolvedValue({});

      await recordToolUsage("merge", [["compress"], ["ocr", "rotate"]]);

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining("/usage"),
        { toolKey: "merge", priorChains: [["compress"], ["ocr", "rotate"]] },
        expect.objectContaining({ suppressErrorToast: true }),
      );
    });

    it("posts an empty chain list for an untracked run", async () => {
      mockPost.mockResolvedValue({});

      await recordToolUsage("ocr");

      expect(mockPost.mock.calls[0][1]).toEqual({
        toolKey: "ocr",
        priorChains: [],
      });
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
});
