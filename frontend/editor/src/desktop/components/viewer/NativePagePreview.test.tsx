/**
 * Contract for the native page preview: it shows the first pages rendered
 * natively as soon as a file with a disk path lands, sizes them from the
 * native document info, revokes every blob URL it made, and gets out of the
 * way once the engine has painted a page of its own.
 */
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  info: null as { pageCount: number; pages: Array<{ width: number; height: number; rotation: number }> } | null,
  blobs: 0,
  infoCalls: [] as string[],
  pageCalls: [] as Array<[string, number, number]>,
  revoked: [] as string[],
}));

vi.mock("@app/services/nativePdfRender", () => ({
  renderNativeDocumentInfo: async (path: string) => {
    mocks.infoCalls.push(path);
    return mocks.info;
  },
  renderNativePdfPageBlob: async (path: string, page: number, width: number) => {
    mocks.pageCalls.push([path, page, width]);
    mocks.blobs += 1;
    return new Blob([`page-${page}`], { type: "image/jpeg" });
  },
}));

import { NativePagePreview } from "@app/components/viewer/NativePagePreview";

const preview = () => document.querySelector('[data-testid="native-page-preview"]');
const images = () => Array.from(preview()?.querySelectorAll("img") ?? []);

describe("NativePagePreview (desktop)", () => {
  beforeEach(() => {
    mocks.info = {
      pageCount: 500,
      pages: [
        { width: 612, height: 792, rotation: 0 },
        { width: 612, height: 792, rotation: 0 },
        { width: 300, height: 350, rotation: 90 },
      ],
    };
    mocks.blobs = 0;
    mocks.infoCalls.length = 0;
    mocks.pageCalls.length = 0;
    mocks.revoked.length = 0;
    let sequence = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${(sequence += 1)}`) as never;
    URL.revokeObjectURL = vi.fn((url: string) => {
      mocks.revoked.push(url);
    }) as never;
    document
      .querySelectorAll("[data-page-index]")
      .forEach((element) => element.remove());
  });

  test("renders the first pages natively with their native geometry", async () => {
    render(<NativePagePreview filePath="/tmp/report.pdf" />);
    await waitFor(() => expect(images()).toHaveLength(3));
    expect(mocks.infoCalls).toEqual(["/tmp/report.pdf"]);
    expect(mocks.pageCalls).toEqual([
      ["/tmp/report.pdf", 1, 1200],
      ["/tmp/report.pdf", 2, 1200],
      ["/tmp/report.pdf", 3, 1200],
    ]);
    expect(images()[2]?.style.aspectRatio).toBe("300 / 350");
  });

  test("shows a single page when the document info is unavailable", async () => {
    mocks.info = null;
    render(<NativePagePreview filePath="/tmp/report.pdf" />);
    await waitFor(() => expect(images()).toHaveLength(1));
  });

  test("shows nothing without a disk path", async () => {
    render(<NativePagePreview filePath={null} />);
    await act(() => Promise.resolve());
    expect(preview()).toBeNull();
    expect(mocks.infoCalls).toHaveLength(0);
  });

  test("revokes every blob URL on unmount", async () => {
    const { unmount } = render(<NativePagePreview filePath="/tmp/report.pdf" />);
    await waitFor(() => expect(images()).toHaveLength(3));
    unmount();
    expect(mocks.revoked).toEqual([
      "blob:preview-1",
      "blob:preview-2",
      "blob:preview-3",
    ]);
  });

  test("yields to the engine once a page paints", async () => {
    vi.useFakeTimers();
    try {
      render(<NativePagePreview filePath="/tmp/report.pdf" />);
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      expect(preview()).not.toBeNull();

      const page = document.createElement("div");
      page.setAttribute("data-page-index", "0");
      page.appendChild(document.createElement("canvas"));
      document.body.appendChild(page);

      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(preview()).toBeNull();
      expect(mocks.revoked.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
