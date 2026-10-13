import { describe, expect, it, vi } from "vitest";
import {
  holdUnlockPrompt,
  isUnlockPromptHeld,
  subscribeToUnlockPromptHold,
} from "@app/services/unlockPromptHold";

describe("unlockPromptHold", () => {
  it("is held from the first hold until the last is released", () => {
    expect(isUnlockPromptHeld()).toBe(false);
    const releaseFirst = holdUnlockPrompt();
    const releaseSecond = holdUnlockPrompt();
    expect(isUnlockPromptHeld()).toBe(true);
    releaseFirst();
    expect(isUnlockPromptHeld()).toBe(true);
    releaseSecond();
    expect(isUnlockPromptHeld()).toBe(false);
  });

  it("ignores a second release of the same hold", () => {
    const outer = holdUnlockPrompt();
    const inner = holdUnlockPrompt();
    inner();
    inner();
    expect(isUnlockPromptHeld()).toBe(true);
    outer();
    expect(isUnlockPromptHeld()).toBe(false);
  });

  it("notifies subscribers on hold and release, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnlockPromptHold(listener);
    const release = holdUnlockPrompt();
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    holdUnlockPrompt()();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
