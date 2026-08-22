import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  AppSwitchProvider,
  useAppSwitch,
  zoneForPath,
} from "@app/components/shared/AppSwitchProvider";
import { preferencesService } from "@app/services/preferencesService";
import type { AppSwitchStyle } from "@app/constants/appSwitchStyle";

const preloadAdminRoutes = vi.fn(() => Promise.resolve());
vi.mock("@app/routes/adminRouteExtensions", () => ({
  getAdminRouteExtensions: () => [],
  preloadAdminRoutes: () => preloadAdminRoutes(),
}));

/**
 * Stands in for an app: the current path, a button that switches to the other
 * one, and a rail. The rail is keyed by path so each app gets its own element -
 * that swap is the signal the provider waits on before revealing the arrival.
 */
function Harness({ to }: { to: "editor" | "processor" }) {
  const { switchToApp } = useAppSwitch();
  const { pathname } = useLocation();
  return (
    <>
      <div className="file-sidebar" key={pathname} />
      <button type="button" onClick={() => switchToApp(to)}>
        {pathname}
      </button>
    </>
  );
}

function setup(at: string, to: "editor" | "processor") {
  const view = render(
    <MemoryRouter initialEntries={[at]}>
      <AppSwitchProvider>
        <Harness to={to} />
      </AppSwitchProvider>
    </MemoryRouter>,
  );
  const { unmount } = view;
  return {
    zone: () => document.querySelector(".app-zone"),
    trigger: () => screen.getAllByRole("button")[0],
    unmount,
  };
}

/** Runs the timers the switch is sequenced on, flushing React in between.
 *  Async so the promise the arrival waits on (the chunk preload) settles too. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Finishes the outgoing half: its timer, then the frames the provider spends
 * waiting for the incoming app to paint its shell.
 */
async function completeHalf(ms: number) {
  await advance(ms);
  await advance(64);
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("AppSwitchProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    preloadAdminRoutes.mockClear();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    preferencesService.clearAllPreferences();
  });

  test("zoneForPath only claims the processor's own route-set", () => {
    expect(zoneForPath("/processor")).toBe("processor");
    expect(zoneForPath("/processor/users")).toBe("processor");
    expect(zoneForPath("/editor")).toBe("editor");
    // A path that merely starts with the same characters is the editor's.
    expect(zoneForPath("/processorX")).toBe("editor");
  });

  test("is layout-transparent until a switch starts", () => {
    const { zone } = setup("/editor", "processor");
    expect(zone()).toHaveAttribute("data-phase", "idle");
    expect(document.querySelector(".app-switch-ground")).toBeNull();
  });

  test("plays exit, then enter, then settles - navigating only once the exit is done", async () => {
    const { zone, trigger } = setup("/editor", "processor");

    act(() => trigger().click());
    expect(zone()).toHaveAttribute("data-phase", "exit");
    expect(zone()).toHaveAttribute("data-dir", "forward");
    // The ground is painted so the swap is never a white flash.
    expect(document.querySelector(".app-switch-ground")).not.toBeNull();
    // Still on the outgoing app: the URL waits for the exit to play.
    expect(trigger()).toHaveTextContent("/editor");

    await completeHalf(220);
    expect(zone()).toHaveAttribute("data-phase", "enter");
    expect(trigger()).toHaveTextContent("/processor");

    await advance(320);
    expect(zone()).toHaveAttribute("data-phase", "idle");
    expect(document.querySelector(".app-switch-ground")).toBeNull();
  });

  test("going back rewinds the outbound move - the two halves swap length", async () => {
    const { zone, trigger } = setup("/processor", "editor");

    act(() => trigger().click());
    expect(zone()).toHaveAttribute("data-dir", "back");

    // The arrival un-arrives first, so the outgoing half is the longer one -
    // the forward move's 220ms departure is NOT what plays here.
    await advance(220);
    expect(zone()).toHaveAttribute("data-phase", "exit");
    await completeHalf(100);
    expect(zone()).toHaveAttribute("data-phase", "enter");
    expect(trigger()).toHaveTextContent("/");

    // ...and the incoming half is the departure undone, so the shorter one.
    await advance(220);
    expect(zone()).toHaveAttribute("data-phase", "idle");
  });

  test("warms the processor chunk before leaving the editor", () => {
    const { trigger } = setup("/editor", "processor");

    act(() => trigger().click());
    expect(preloadAdminRoutes).toHaveBeenCalled();
  });

  test("reduced motion switches straight over with no animation layers", () => {
    setReducedMotion(true);
    const { zone, trigger } = setup("/editor", "processor");

    act(() => trigger().click());
    expect(trigger()).toHaveTextContent("/processor");
    expect(zone()).toHaveAttribute("data-phase", "idle");
    expect(document.querySelector(".app-switch-ground")).toBeNull();
  });

  test("stamps the chosen style on the layers so the CSS can pick it up", () => {
    preferencesService.setPreference("appSwitchStyle", "depth");
    const { zone, trigger } = setup("/editor", "processor");

    act(() => trigger().click());
    expect(zone()).toHaveAttribute("data-style", "depth");
    expect(document.querySelector(".app-switch-ground")).toHaveAttribute(
      "data-style",
      "depth",
    );
  });

  test("styles that carry the chrome away skip the pinned brand", () => {
    // panels slides the rail off screen and wipe covers it - a pinned mark
    // would be left hanging over nothing.
    for (const style of ["panels", "wipe"] as AppSwitchStyle[]) {
      preferencesService.setPreference("appSwitchStyle", style);
      const { trigger, unmount } = setup("/editor", "processor");
      act(() => trigger().click());
      expect(document.querySelector(".app-switch-brand")).toBeNull();
      unmount();
    }
  });

  test("a second click mid-switch does not restart the transition", async () => {
    const { zone, trigger } = setup("/editor", "processor");

    act(() => trigger().click());
    await advance(100);
    act(() => trigger().click());
    // Still the same exit, not a fresh one: 120ms more finishes it.
    expect(zone()).toHaveAttribute("data-phase", "exit");
    await completeHalf(120);
    expect(zone()).toHaveAttribute("data-phase", "enter");
  });
});
