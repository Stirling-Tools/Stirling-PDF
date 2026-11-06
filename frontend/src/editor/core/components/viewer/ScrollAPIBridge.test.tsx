import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollAPIBridge } from "@editor/components/viewer/ScrollAPIBridge";

const bridge = vi.hoisted(() => ({
  scrollApi: { scrollToPage: vi.fn() },
  scroll: { currentPage: 1, totalPages: 10 },
  registerBridge: vi.fn(),
  triggerImmediateScrollUpdate: vi.fn(),
  documentId: "doc-1" as string | null,
  ready: true,
}));

vi.mock("@embedpdf/plugin-scroll/react", () => ({
  useScroll: () => ({ provides: bridge.scrollApi, state: bridge.scroll }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({
    registerBridge: bridge.registerBridge,
    triggerImmediateScrollUpdate: bridge.triggerImmediateScrollUpdate,
  }),
}));
vi.mock("@editor/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => bridge.documentId,
}));
vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => bridge.ready,
}));

describe("ScrollAPIBridge", () => {
  beforeEach(() => {
    bridge.scroll.currentPage = 1;
    bridge.scroll.totalPages = 10;
    bridge.documentId = "doc-1";
    bridge.ready = true;
    vi.clearAllMocks();
  });

  it("keeps the bridge registered across page turns", () => {
    const { rerender, unmount } = render(<ScrollAPIBridge />);
    expect(bridge.registerBridge).toHaveBeenLastCalledWith("scroll", {
      state: { currentPage: 1, totalPages: 10 },
      api: bridge.scrollApi,
    });

    bridge.scroll.currentPage = 2;
    rerender(<ScrollAPIBridge />);
    expect(bridge.registerBridge).toHaveBeenLastCalledWith("scroll", {
      state: { currentPage: 2, totalPages: 10 },
      api: bridge.scrollApi,
    });
    expect(bridge.registerBridge).not.toHaveBeenCalledWith("scroll", null);

    unmount();
    expect(bridge.registerBridge).toHaveBeenCalledWith("scroll", null);
  });
});
