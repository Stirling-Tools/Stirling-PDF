import { describe, expect, it } from "vitest";
import {
  clampMin,
  savedToastBody,
} from "@app/components/shared/config/configSections/aiEngineSettings";

describe("clampMin", () => {
  it("keeps a valid integer unchanged", () => {
    expect(clampMin(8192, 1)).toBe(8192);
    expect(clampMin(200, 1)).toBe(200);
  });

  it("floors below the minimum for empty / zero / NaN / junk input", () => {
    // A cleared NumberInput yields "" -> 0; a transient "-" -> NaN; both must clamp to min.
    expect(clampMin("", 1)).toBe(1);
    expect(clampMin(0, 1)).toBe(1);
    expect(clampMin(Number.NaN, 1)).toBe(1);
    expect(clampMin(undefined, 1)).toBe(1);
    expect(clampMin("-", 1)).toBe(1);
  });

  it("floors fractional values to an integer", () => {
    expect(clampMin(5.7, 1)).toBe(5);
  });

  it("allows zero when the minimum is zero (e.g. maxSearches)", () => {
    expect(clampMin(0, 0)).toBe(0);
    expect(clampMin("", 0)).toBe(0);
    expect(clampMin(4, 0)).toBe(4);
  });
});

describe("savedToastBody", () => {
  // The helper is passed i18next's t(); echo the key back so assertions read clearly.
  const t = (key: string) => key;

  it("promises a live push only when AI is on and config push is enabled", () => {
    expect(savedToastBody({ enabled: true, pushConfigToEngine: true }, t)).toBe(
      "admin.settings.ai.saved.body",
    );
    // pushConfigToEngine defaults to true on the backend, so an absent flag still promises it.
    expect(savedToastBody({ enabled: true }, t)).toBe(
      "admin.settings.ai.saved.body",
    );
  });

  it("does not promise a push the processor will not make", () => {
    // AI off: pushLiveAfterSave returns early, so nothing reaches the engine.
    expect(savedToastBody({ enabled: false }, t)).toBe(
      "admin.settings.ai.saved.bodyNoPush",
    );
    // Env-driven deployment (SaaS pins this false): the engine owns its own config.
    expect(
      savedToastBody({ enabled: true, pushConfigToEngine: false }, t),
    ).toBe("admin.settings.ai.saved.bodyNoPush");
  });
});
