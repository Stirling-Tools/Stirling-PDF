import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewerPageViewMenu } from "@editor/components/viewer/ViewerPageViewMenu";

// Built once: the menu's effects depend on the identity of these values.
const viewer = vi.hoisted(() => {
  const zoomListeners = new Set<(percent: number) => void>();
  const spreadListeners = new Set<(mode: string) => void>();
  const state = {
    level: undefined as ZoomLevel | undefined,
    spreadMode: "none",
  };
  return {
    state,
    notifyZoom: (level: ZoomLevel) => {
      state.level = level;
      for (const listener of [...zoomListeners]) listener(100);
    },
    notifySpread: (mode: string) => {
      state.spreadMode = mode;
      for (const listener of [...spreadListeners]) listener(mode);
    },
    value: {
      getScrollState: () => ({ currentPage: 1, totalPages: 3 }),
      getZoomState: () => ({ zoomPercent: 100, level: state.level }),
      getSpreadState: () => ({ spreadMode: state.spreadMode }),
      zoomActions: { requestZoom: vi.fn() },
      spreadActions: { toggleSpreadMode: vi.fn(), setSpreadMode: vi.fn() },
      zoomRestorePendingRef: { current: false },
      zoomRestoreSettledTick: 0,
      registerImmediateZoomUpdate: (listener: (percent: number) => void) => {
        zoomListeners.add(listener);
        return () => {
          zoomListeners.delete(listener);
        };
      },
      registerImmediateScrollUpdate: () => () => {},
      registerImmediateSpreadUpdate: (listener: (mode: string) => void) => {
        spreadListeners.add(listener);
        return () => {
          spreadListeners.delete(listener);
        };
      },
      pdfRenderMode: "normal",
      setPdfRenderMode: vi.fn(),
    },
  };
});

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer.value,
}));
const prefs = vi.hoisted(() => ({
  preferences: { defaultViewerZoom: "auto" },
  updatePreference: vi.fn(),
}));
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => prefs,
}));
vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

// jsdom lays nothing out, so the menu would read its zero-size button as
// scrolled away and hide itself once positioning settles.
const KEEP_MENU_SHOWN = {
  components: { Menu: { defaultProps: { hideDetached: false } } },
};

async function openMenu() {
  const user = userEvent.setup();
  render(
    <MantineProvider theme={KEEP_MENU_SHOWN}>
      <ViewerPageViewMenu />
    </MantineProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "workbenchBar.pageView" }),
  );
  return user;
}

describe("ViewerPageViewMenu", () => {
  beforeEach(() => {
    viewer.state.level = 1;
    viewer.state.spreadMode = SpreadMode.None;
    prefs.preferences.defaultViewerZoom = "auto";
    vi.clearAllMocks();
  });

  it("saves the chosen fit as the default zoom and applies it", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "viewer.fitPage" }),
    );
    expect(prefs.updatePreference).toHaveBeenCalledWith(
      "defaultViewerZoom",
      "fitPage",
    );
    expect(viewer.value.zoomActions.requestZoom).toHaveBeenCalledWith(
      ZoomMode.FitPage,
    );
  });

  it("ticks the saved default zoom", async () => {
    prefs.preferences.defaultViewerZoom = "fitWidth";
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: "viewer.fitWidth" }),
    ).toHaveAccessibleDescription("viewer.menuSelected");
    expect(
      await screen.findByRole("menuitem", { name: "viewer.fitPage" }),
    ).not.toHaveAccessibleDescription();
  });

  it("switches to two pages", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "viewer.dualPageView" }),
    );
    expect(viewer.value.spreadActions.toggleSpreadMode).toHaveBeenCalledOnce();
  });

  it("follows spread changes the document reports", async () => {
    await openMenu();
    act(() => viewer.notifySpread(SpreadMode.Even));
    expect(
      await screen.findByRole("menuitem", { name: "viewer.dualPageView" }),
    ).toHaveAttribute("data-checked", "true");
    expect(
      await screen.findByRole("menuitem", { name: "viewer.coverPageView" }),
    ).toHaveAttribute("data-checked", "true");
  });

  it("offers the cover page from one page at a time, going to pairs", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "viewer.coverPageView" }),
    );
    expect(viewer.value.spreadActions.setSpreadMode).toHaveBeenCalledWith(
      SpreadMode.Even,
    );
  });

  it("picks a page colour directly", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", {
        name: "workbenchBar.pageColourSepia",
      }),
    );
    expect(viewer.value.setPdfRenderMode).toHaveBeenCalledWith("sepia");
  });
});
