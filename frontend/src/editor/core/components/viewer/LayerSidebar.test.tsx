import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LayerSidebar } from "@editor/components/viewer/LayerSidebar";
import type { LayerInfo } from "@editor/components/viewer/layerUtils";

const mocks = vi.hoisted(() => ({ readPdfLayers: vi.fn() }));

const viewer = vi.hoisted(() => ({ toggleLayerSidebar: vi.fn() }));

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

// The real shell wraps the list in a Mantine ScrollArea, which re-renders
// without bound under jsdom's zero-sized layout.
vi.mock("@editor/components/viewer/SidebarBase", () => ({
  SidebarBase: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@editor/components/viewer/layerUtils", async (importActual) => ({
  ...(await importActual<
    typeof import("@editor/components/viewer/layerUtils")
  >()),
  readPdfLayers: mocks.readPdfLayers,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const LAYERS: LayerInfo[] = [{ id: "ocg-1", name: "Ink", visible: true }];
const onApplyLayers = vi.fn();
const onLayersDetected = vi.fn();

function sidebar(file: Blob, documentCacheKey: string) {
  return (
    <MantineProvider>
      <LayerSidebar
        visible
        file={file}
        documentCacheKey={documentCacheKey}
        onApplyLayers={onApplyLayers}
        onLayersDetected={onLayersDetected}
      />
    </MantineProvider>
  );
}

const pdf = () => new Blob(["%PDF-1.7"], { type: "application/pdf" });

describe("LayerSidebar layer read", () => {
  beforeEach(() => {
    mocks.readPdfLayers.mockReset();
    onLayersDetected.mockReset();
  });

  it("reads once when the file changes identity while the read is pending", async () => {
    const read = deferred<LayerInfo[]>();
    mocks.readPdfLayers.mockReturnValue(read.promise);

    const { rerender } = render(sidebar(pdf(), "doc-1"));
    rerender(sidebar(pdf(), "doc-1"));
    read.resolve(LAYERS);

    expect(await screen.findByText("Ink")).toBeInTheDocument();
    expect(mocks.readPdfLayers).toHaveBeenCalledTimes(1);
    expect(onLayersDetected).toHaveBeenLastCalledWith(true);
  });

  it("reads again when the document changes", async () => {
    mocks.readPdfLayers.mockResolvedValue(LAYERS);

    const { rerender } = render(sidebar(pdf(), "doc-1"));
    await screen.findByText("Ink");
    rerender(sidebar(pdf(), "doc-2"));

    await waitFor(() => expect(mocks.readPdfLayers).toHaveBeenCalledTimes(2));
  });

  it("retries a failed read on the next pass for the same document", async () => {
    mocks.readPdfLayers
      .mockRejectedValueOnce(new Error("bad xref"))
      .mockResolvedValue(LAYERS);

    const { rerender } = render(sidebar(pdf(), "doc-1"));
    expect(await screen.findByText("bad xref")).toBeInTheDocument();
    rerender(sidebar(pdf(), "doc-1"));

    expect(await screen.findByText("Ink")).toBeInTheDocument();
    expect(mocks.readPdfLayers).toHaveBeenCalledTimes(2);
  });
});
