import { describe, it, expect, vi, beforeEach } from "vitest";

import apiClient from "@app/services/apiClient";
import {
  fetchToolRecommendations,
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

const http501 = Object.assign(new Error("not implemented"), {
  response: { status: 501 },
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

    it("gives a 404 a few tries before writing the API off", async () => {
      mockGet.mockRejectedValue(http404);

      for (let i = 0; i < 5; i++) await fetchToolRecommendations("compare");

      // Three strikes, then it stops: a lone 404 can be a proxy mid-deploy.
      expect(mockGet).toHaveBeenCalledTimes(3);
    });

    it("forgets earlier 404s once a call succeeds", async () => {
      mockGet.mockRejectedValueOnce(http404).mockRejectedValueOnce(http404);
      await fetchToolRecommendations("compare");
      await fetchToolRecommendations("compare");

      mockGet.mockResolvedValueOnce({ data: { recommendations: [] } });
      await fetchToolRecommendations("compare");

      mockGet.mockRejectedValue(http404);
      for (let i = 0; i < 5; i++) await fetchToolRecommendations("compare");

      expect(mockGet).toHaveBeenCalledTimes(6);
    });

    it("stops fetching after a 501 from an install with nothing to rank", async () => {
      mockGet.mockRejectedValue(http501);

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

      for (let i = 0; i < 5; i++) await recordToolUsage("ocr");

      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it("stops posting after a 501 from an install that declined tracking", async () => {
      mockPost.mockRejectedValue(http501);

      await recordToolUsage("ocr");
      await recordToolUsage("ocr");

      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });
});
