import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the api module itself. The component tests mock it wholesale,
 * so they cannot catch mistakes in how it talks to the http client — a
 * double-encoded body slipped through that gap once. These pin the call shape.
 */

const json = vi.fn();

vi.mock("@portal/api/http", () => ({
  apiClient: { local: { json: (...args: unknown[]) => json(...args) } },
}));

const { applyFileRunEventAction, fetchFileRunEvents } =
  await import("@portal/api/fileRunEvents");

describe("fileRunEvents api", () => {
  beforeEach(() => json.mockReset());

  describe("fetchFileRunEvents", () => {
    it("requests the collection with no query when unfiltered", async () => {
      json.mockResolvedValue({ events: [] });

      await fetchFileRunEvents();

      expect(json).toHaveBeenCalledWith("/api/v1/file-run-events");
    });

    it("serialises only the filters that were supplied", async () => {
      json.mockResolvedValue({ events: [] });

      await fetchFileRunEvents({ status: "NEW", limit: 10 });

      const [path] = json.mock.calls[0] as [string];
      const query = new URL(path, "http://localhost").searchParams;
      expect(query.get("status")).toBe("NEW");
      expect(query.get("limit")).toBe("10");
      expect(query.has("kindId")).toBe(false);
    });

    it("never sends a team parameter, because the server derives it", async () => {
      // The server derives the team, so asserted here to keep a param from creeping in.
      json.mockResolvedValue({ events: [] });

      await fetchFileRunEvents({ status: "NEW", kindId: "UNKNOWN", limit: 5 });

      const [path] = json.mock.calls[0] as [string];
      expect(path).not.toMatch(/team/i);
    });

    it("unwraps the response envelope", async () => {
      json.mockResolvedValue({ events: [{ id: "a" }] });

      await expect(fetchFileRunEvents()).resolves.toEqual([{ id: "a" }]);
    });

    it("tolerates a response with no events array", async () => {
      json.mockResolvedValue(undefined);

      await expect(fetchFileRunEvents()).resolves.toEqual([]);
    });
  });

  describe("applyFileRunEventAction", () => {
    it("passes body as an object, not a pre-serialised string", async () => {
      // The regression this file exists for: apiClient stringifies `body`
      // itself, so a string here would arrive double-encoded.
      json.mockResolvedValue({ id: "fre-1" });

      await applyFileRunEventAction("fre-1", "ACKNOWLEDGE");

      const [, options] = json.mock.calls[0] as [
        string,
        { method: string; body: unknown },
      ];
      expect(typeof options.body).toBe("object");
      expect(options.body).toEqual({ inputs: {} });
      expect(options.method).toBe("POST");
    });

    it("forwards collected inputs", async () => {
      json.mockResolvedValue({ id: "fre-1" });

      await applyFileRunEventAction("fre-1", "ACKNOWLEDGE", {
        password: "hunter2",
      });

      const [, options] = json.mock.calls[0] as [string, { body: unknown }];
      expect(options.body).toEqual({ inputs: { password: "hunter2" } });
    });

    it("encodes ids into the path so an odd id cannot break the URL", async () => {
      json.mockResolvedValue({ id: "x" });

      await applyFileRunEventAction("a/b?c", "ACKNOWLEDGE");

      const [path] = json.mock.calls[0] as [string];
      expect(path).toBe(
        "/api/v1/file-run-events/a%2Fb%3Fc/actions/ACKNOWLEDGE",
      );
    });
  });
});
