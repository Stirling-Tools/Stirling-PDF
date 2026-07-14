import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import { DEFAULT_CLASSIFICATION_LABELS } from "@app/data/classificationLabels";
import { seedTeamLabelsIfEmpty } from "@app/services/labelsBackend";

vi.mock("@app/services/apiClient");

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);

// The service only reads `status`/`data` off the axios response; a partial shape
// is all these tests need, so cast the mock values through this helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const res = (value: object): any => value;

// 204 No Content (nothing stored) comes back as an empty body.
const emptyResponse = res({ status: 204, data: "" });
const storedResponse = res({
  status: 200,
  data: { labels: [{ id: "invoice", name: "Invoice", icon: "receipt" }] },
});
const putEcho = res({ data: { labels: DEFAULT_CLASSIFICATION_LABELS } });

describe("seedTeamLabelsIfEmpty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the built-in defaults when the team has no set", async () => {
    get.mockResolvedValue(emptyResponse);
    put.mockResolvedValue(putEcho);

    await seedTeamLabelsIfEmpty();

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("/api/v1/classification/labels", {
      labels: DEFAULT_CLASSIFICATION_LABELS,
    });
  });

  it("is a no-op when the team already has a set (never clobbers)", async () => {
    get.mockResolvedValue(storedResponse);

    await seedTeamLabelsIfEmpty();

    expect(put).not.toHaveBeenCalled();
  });

  it("rides out a transient fetch failure, then seeds", async () => {
    vi.useFakeTimers();
    get
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(emptyResponse);
    put.mockResolvedValue(putEcho);

    const pending = seedTeamLabelsIfEmpty();
    await vi.runAllTimersAsync();
    await pending;

    expect(get).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("rides out a transient write failure, then seeds", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(emptyResponse);
    put
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(putEcho);

    const pending = seedTeamLabelsIfEmpty();
    await vi.runAllTimersAsync();
    await pending;

    expect(put).toHaveBeenCalledTimes(2);
  });

  it("throws after a persistent fetch failure without writing (clobber-safe)", async () => {
    vi.useFakeTimers();
    get.mockRejectedValue(new Error("backend down"));

    const pending = seedTeamLabelsIfEmpty();
    const assertion = expect(pending).rejects.toThrow("backend down");
    await vi.runAllTimersAsync();
    await assertion;

    // Never writes when the fetch can't confirm the team has no set.
    expect(put).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("throws after a persistent write failure", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(emptyResponse);
    put.mockRejectedValue(new Error("write failed"));

    const pending = seedTeamLabelsIfEmpty();
    const assertion = expect(pending).rejects.toThrow("write failed");
    await vi.runAllTimersAsync();
    await assertion;

    expect(put).toHaveBeenCalledTimes(3);
  });
});
