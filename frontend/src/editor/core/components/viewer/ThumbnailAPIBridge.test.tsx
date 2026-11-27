import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbnailAPIBridge } from "@editor/components/viewer/ThumbnailAPIBridge";
import type {
  ViewerLayoutPage,
  ViewerPageLayout,
} from "@editor/contexts/viewer/ViewerPageTool";

const fixture = vi.hoisted(() => {
  const state = {
    core: {
      activeDocumentId: "doc",
      documents: {
        doc: {
          status: "loaded",
          document: {
            id: "doc",
            pageCount: 1,
            pages: [{ index: 0, size: { width: 600, height: 800 } }],
          },
        },
      },
    },
  };
  const bridges = new Map<string, { api: Record<string, unknown> } | null>();
  const renderPageRect = vi.fn(() => ({ wait: () => undefined }));
  return { state, bridges, renderPageRect };
});

vi.mock("@embedpdf/core/react", () => ({
  useRegistry: () => ({
    registry: { getStore: () => ({ getState: () => fixture.state }) },
  }),
}));
vi.mock("@embedpdf/plugin-render/react", () => ({
  useRenderCapability: () => ({
    provides: {
      forDocument: () => ({ renderPageRect: fixture.renderPageRect }),
    },
  }),
}));
vi.mock("@embedpdf/plugin-thumbnail/react", () => ({
  useThumbnailCapability: () => ({ provides: { renderThumb: vi.fn() } }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({
    registerBridge: (
      kind: string,
      bridge: { api: Record<string, unknown> } | null,
    ) => fixture.bridges.set(kind, bridge),
  }),
}));
vi.mock("@editor/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => "doc",
  useDocumentReady: () => true,
}));

type RenderThumb = (
  pageIndex: number,
  dpr: number,
) => { toPromise: () => Promise<Blob> };

const page: ViewerLayoutPage = { width: 600, height: 800, quarterTurns: 0 };

function toolLayout(
  pages: ViewerLayoutPage[] | null,
  renderThumbnail: ViewerPageLayout["renderThumbnail"],
): ViewerPageLayout {
  return {
    subscribe: () => () => undefined,
    pages: () => pages,
    renderThumbnail,
  };
}

function renderThumbWith(layout: ViewerPageLayout | null): RenderThumb {
  render(<ThumbnailAPIBridge layout={layout} />);
  return fixture.bridges.get("thumbnail")!.api.renderThumb as RenderThumb;
}

describe("ThumbnailAPIBridge", () => {
  beforeEach(() => fixture.renderPageRect.mockClear());

  it("asks the tool to draw the pages it lays out", async () => {
    const drawn = new Blob(["page 2"]);
    const renderThumbnail = vi.fn(async () => drawn);
    const renderThumb = renderThumbWith(
      toolLayout([page, page], renderThumbnail),
    );

    await expect(renderThumb(1, 2).toPromise()).resolves.toBe(drawn);
    expect(renderThumbnail).toHaveBeenCalledWith(1, 300);
    expect(fixture.renderPageRect).not.toHaveBeenCalled();
  });

  it("fails the thumbnail when the tool cannot draw it", async () => {
    const renderThumb = renderThumbWith(
      toolLayout([page], async () => {
        throw new Error("gone");
      }),
    );

    await expect(renderThumb(0, 1).toPromise()).rejects.toMatchObject({
      reason: { message: "gone" },
    });
  });

  it("draws the file's own pages while the tool leaves them alone", () => {
    const renderThumbnail = vi.fn();
    const renderThumb = renderThumbWith(toolLayout(null, renderThumbnail));

    renderThumb(0, 1);

    expect(fixture.renderPageRect).toHaveBeenCalledTimes(1);
    expect(renderThumbnail).not.toHaveBeenCalled();
  });
});
