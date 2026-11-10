import { beforeEach, describe, expect, it } from "vitest";
import {
  getGuestAccessServerSnapshot,
  getGuestAccessSnapshot,
  isGuestAccessAllowed,
  isGuestActive,
  setGuestAccessAllowed,
  setGuestSignedIn,
  subscribeGuestAccess,
} from "@editor/auth/guestAccess";

/** Every test starts from the shipped default: login on, guests not admitted. */
beforeEach(() => {
  window.localStorage.clear();
  setGuestAccessAllowed(false);
  setGuestSignedIn(false);
});

describe("guest access store", () => {
  it("is off until the server says otherwise", () => {
    expect(isGuestAccessAllowed()).toBe(false);
    expect(isGuestActive()).toBe(false);
    expect(getGuestAccessSnapshot()).toBe(false);
  });

  it("turns a signed-out visit into a guest visit", () => {
    setGuestAccessAllowed(true);
    expect(isGuestActive()).toBe(true);
    expect(getGuestAccessSnapshot()).toBe(true);
  });

  it("steps aside for a real session and comes back when it ends", () => {
    setGuestAccessAllowed(true);
    setGuestSignedIn(true);
    expect(isGuestActive()).toBe(false);

    setGuestSignedIn(false);
    expect(isGuestActive()).toBe(true);
  });

  it("keeps the guest shell off while a session resolves", () => {
    // The provider publishes the outcome of /auth/me; until it does, whoever
    // signed in last owns the tab and must not be shown a guest's toolbar.
    setGuestAccessAllowed(true);
    setGuestSignedIn(true);
    expect(isGuestActive()).toBe(false);

    // Signing out hands the tab back to guests, with no reload.
    setGuestSignedIn(false);
    expect(isGuestActive()).toBe(true);
  });

  it("publishes only real changes", () => {
    let calls = 0;
    const unsubscribe = subscribeGuestAccess(() => {
      calls += 1;
    });

    setGuestAccessAllowed(true);
    setGuestAccessAllowed(true);
    setGuestAccessAllowed(false);
    expect(calls).toBe(2);

    unsubscribe();
    setGuestAccessAllowed(true);
    expect(calls).toBe(2);
  });

  it("has a server snapshot that is never a guest", () => {
    setGuestAccessAllowed(true);
    expect(getGuestAccessServerSnapshot()).toBe(false);
  });
});
