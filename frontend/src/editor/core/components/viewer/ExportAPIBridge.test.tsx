import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExportAPIBridge } from "@editor/components/viewer/ExportAPIBridge";
import type { ExportAPIWrapper } from "@editor/contexts/viewer/viewerBridges";

const mock = vi.hoisted(() => ({
  saveAsCopy: vi.fn(),
  register: vi.fn(),
  ready: true,
  available: true,
}));
vi.mock("@embedpdf/plugin-export/react", () => ({
  useExportCapability: () => ({
    provides: mock.available ? { saveAsCopy: mock.saveAsCopy } : undefined,
  }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ registerBridge: mock.register }),
}));
vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => mock.ready,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.ready = true;
  mock.available = true;
});
afterEach(cleanup);

function exportApi(): ExportAPIWrapper {
  return mock.register.mock.calls.at(-1)?.[1].api;
}

it.each([false, true])(
  "downloads untouched protected bytes with native export available=%s",
  async (available) => {
    mock.available = available;
    const source = new File(["protected"], "protected.pdf");
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 10]).buffer;
    vi.spyOn(source, "arrayBuffer").mockResolvedValue(bytes);
    render(<ExportAPIBridge originalFile={source} />);
    expect(await exportApi().saveAsCopy().toPromise()).toBe(bytes);
    expect(mock.saveAsCopy).not.toHaveBeenCalled();
  },
);

it("continues using native export for editable unprotected documents", async () => {
  const bytes = new ArrayBuffer(4);
  mock.saveAsCopy.mockReturnValue({ toPromise: async () => bytes });
  render(<ExportAPIBridge />);
  expect(await exportApi().saveAsCopy().toPromise()).toBe(bytes);
  expect(mock.saveAsCopy).toHaveBeenCalledOnce();
});

it("replaces the source when switching protected documents and unregisters on close", async () => {
  const first = new File(["one"], "one.pdf");
  const second = new File(["two"], "two.pdf");
  const firstBytes = new ArrayBuffer(1);
  const secondBytes = new ArrayBuffer(2);
  vi.spyOn(first, "arrayBuffer").mockResolvedValue(firstBytes);
  vi.spyOn(second, "arrayBuffer").mockResolvedValue(secondBytes);
  const view = render(<ExportAPIBridge originalFile={first} />);
  expect(await exportApi().saveAsCopy().toPromise()).toBe(firstBytes);
  view.rerender(<ExportAPIBridge originalFile={second} />);
  expect(await exportApi().saveAsCopy().toPromise()).toBe(secondBytes);
  view.unmount();
  expect(mock.register).toHaveBeenLastCalledWith("export", null);
});

it("does not expose an export before the document is ready", () => {
  mock.ready = false;
  render(
    <ExportAPIBridge originalFile={new File(["protected"], "protected.pdf")} />,
  );
  expect(mock.register).not.toHaveBeenCalled();
});

it("never falls back to native export when a protected source is unavailable", () => {
  render(<ExportAPIBridge disabled />);
  expect(mock.register).not.toHaveBeenCalled();
  expect(mock.saveAsCopy).not.toHaveBeenCalled();
});
