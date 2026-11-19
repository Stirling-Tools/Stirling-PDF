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
vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

async function openMenu() {
  const user = userEvent.setup();
  render(
    <MantineProvider>
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
    vi.clearAllMocks();
  });

  it("requests the plugin's fit modes", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "viewer.fitWidth" }),
    );
    expect(viewer.value.zoomActions.requestZoom).toHaveBeenCalledWith(
      ZoomMode.FitWidth,
    );
  });

  it("ticks the fit mode the plugin reports", async () => {
    await openMenu();
    const fitWidth = await screen.findByRole("menuitem", {
      name: "viewer.fitWidth",
    });
    const fitPage = screen.getByRole("menuitem", { name: "viewer.fitPage" });
    expect(fitWidth).not.toHaveAttribute("data-checked");

    // Same percent either way: the level alone has to move the tick.
    act(() => viewer.notifyZoom(ZoomMode.FitPage));
    expect(fitPage).toHaveAttribute("data-checked", "true");
    expect(fitWidth).not.toHaveAttribute("data-checked");
  });

  it("switches to two pages", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "viewer.dualPageView" }),
    );
    expect(viewer.value.spreadActions.toggleSpreadMode).toHaveBeenCalledOnce();
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
