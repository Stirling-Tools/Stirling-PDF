import { beforeEach, describe, expect, test } from "vitest";
import {
  acknowledgeToolFreshness,
  getAcknowledgedToolVersions,
  getToolFreshness,
  isRecentRelease,
  isToolFreshnessAcknowledged,
  latestTaggedVersion,
  resetToolFreshnessCache,
} from "@app/utils/toolFreshness";

const STORAGE_KEY = "stirling.toolFreshness.acknowledged";

beforeEach(() => {
  window.localStorage.clear();
  resetToolFreshnessCache();
});

describe("isRecentRelease", () => {
  test("current and previous minor are recent", () => {
    expect(isRecentRelease("2.15.0", "2.15.2")).toBe(true);
    expect(isRecentRelease("2.14.0", "2.15.2")).toBe(true);
  });

  test("two minors back is stale", () => {
    expect(isRecentRelease("2.13.0", "2.15.2")).toBe(false);
  });

  test("tagged version ahead of the build is recent", () => {
    expect(isRecentRelease("2.16.0", "2.15.2")).toBe(true);
    expect(isRecentRelease("3.0.0", "2.15.2")).toBe(true);
    expect(isRecentRelease("2.15.0", "0.0.0")).toBe(true);
  });

  test("older major is stale", () => {
    expect(isRecentRelease("1.9.0", "2.0.0")).toBe(false);
  });

  test("unknown app version keeps badges visible", () => {
    expect(isRecentRelease("2.15.0", undefined)).toBe(true);
    expect(isRecentRelease("2.15.0", null)).toBe(true);
  });

  test("unparseable tagged version never badges", () => {
    expect(isRecentRelease("next", "2.15.0")).toBe(false);
    expect(isRecentRelease("", "2.15.0")).toBe(false);
  });

  test("accepts a v prefix", () => {
    expect(isRecentRelease("v2.15.0", "2.15.2")).toBe(true);
  });
});

describe("latestTaggedVersion", () => {
  test("picks the higher of new and updated", () => {
    expect(
      latestTaggedVersion({
        newInVersion: "2.14.0",
        updatedInVersion: "2.15.0",
      }),
    ).toBe("2.15.0");
    expect(
      latestTaggedVersion({
        newInVersion: "2.15.0",
        updatedInVersion: "2.14.0",
      }),
    ).toBe("2.15.0");
    expect(latestTaggedVersion({ newInVersion: "2.14.0" })).toBe("2.14.0");
    expect(latestTaggedVersion({})).toBeNull();
  });
});

describe("getToolFreshness", () => {
  test("recent newInVersion shows New", () => {
    expect(getToolFreshness({ newInVersion: "2.15.0" }, "2.15.1")).toEqual({
      badge: "new",
      version: "2.15.0",
    });
  });

  test("stale newInVersion with recent update shows Updated", () => {
    expect(
      getToolFreshness(
        { newInVersion: "2.10.0", updatedInVersion: "2.15.0" },
        "2.15.1",
      ),
    ).toEqual({ badge: "updated", version: "2.15.0" });
  });

  test("New outranks Updated and advertises the latest version", () => {
    expect(
      getToolFreshness(
        { newInVersion: "2.14.0", updatedInVersion: "2.15.0" },
        "2.15.1",
      ),
    ).toEqual({ badge: "new", version: "2.15.0" });
  });

  test("stale or missing versions produce no badge", () => {
    expect(getToolFreshness({ newInVersion: "2.10.0" }, "2.15.1")).toBeNull();
    expect(getToolFreshness({}, "2.15.1")).toBeNull();
  });
});

describe("acknowledgements", () => {
  test("acknowledging hides that version but not a later one", () => {
    acknowledgeToolFreshness("autoRotate", { newInVersion: "2.15.0" });
    let acknowledged = getAcknowledgedToolVersions();
    expect(
      isToolFreshnessAcknowledged(acknowledged, "autoRotate", "2.15.0"),
    ).toBe(true);
    expect(
      isToolFreshnessAcknowledged(acknowledged, "autoRotate", "2.16.0"),
    ).toBe(false);

    // A later update re-surfaces the badge until acknowledged again.
    acknowledgeToolFreshness("autoRotate", {
      newInVersion: "2.15.0",
      updatedInVersion: "2.16.0",
    });
    acknowledged = getAcknowledgedToolVersions();
    expect(
      isToolFreshnessAcknowledged(acknowledged, "autoRotate", "2.16.0"),
    ).toBe(true);
  });

  test("persists to localStorage and survives a cache reset", () => {
    acknowledgeToolFreshness("sharedSign", { newInVersion: "2.14.0" });
    resetToolFreshnessCache();
    expect(
      isToolFreshnessAcknowledged(
        getAcknowledgedToolVersions(),
        "sharedSign",
        "2.14.0",
      ),
    ).toBe(true);
  });

  test("untagged tools are never recorded", () => {
    acknowledgeToolFreshness("merge", {});
    expect(getAcknowledgedToolVersions()).toEqual({});
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("corrupt stored state is ignored", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    expect(getAcknowledgedToolVersions()).toEqual({});

    resetToolFreshnessCache();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["a"]));
    expect(getAcknowledgedToolVersions()).toEqual({});

    resetToolFreshnessCache();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ good: "2.15.0", bad: 42 }),
    );
    expect(getAcknowledgedToolVersions()).toEqual({ good: "2.15.0" });
  });
});
