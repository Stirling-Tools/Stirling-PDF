import { describe, expect, it, vi } from "vitest";
import type { PluginRegistry } from "@embedpdf/core";
import { RenderPlugin } from "@embedpdf/plugin-render";
import { setRenderWithForms } from "@editor/components/viewer/RenderFormsBridge";

function createPlugin() {
  const page = { index: 0 };
  const state = {
    core: {
      activeDocumentId: "doc",
      documents: { doc: { document: { pages: [page] } } },
    },
  };
  const engine = { renderPage: vi.fn() };
  const store = {
    getState: () => state,
    subscribe: () => () => {},
    onAction: () => () => {},
    getPluginStore: () => ({ subscribeToState: () => () => {} }),
  };
  const registry = {
    getEngine: () => engine,
    getLogger: () => ({ info: () => {}, debug: () => {} }),
    getStore: () => store,
  } as unknown as PluginRegistry;
  const plugin = new RenderPlugin("render", registry, { withForms: true });
  return { plugin, engine };
}

describe("setRenderWithForms", () => {
  it("changes what the render plugin passes to the engine", () => {
    const { plugin, engine } = createPlugin();
    const render = () =>
      plugin.provides().renderPage({ pageIndex: 0, options: {} });

    render();
    expect(engine.renderPage.mock.calls[0][2].withForms).toBe(true);

    expect(setRenderWithForms(plugin, false)).toBe(true);
    render();
    expect(engine.renderPage.mock.calls[1][2].withForms).toBe(false);
  });

  it("reports no change when the value is already set", () => {
    const { plugin } = createPlugin();
    expect(setRenderWithForms(plugin, true)).toBe(false);
  });
});
