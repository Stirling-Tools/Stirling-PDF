/**
 * Contract for the engine thumbnail registry: a caller that only holds the file
 * id waits for the viewer's open, gets the worker-rendered thumbnail, and falls
 * back to null (its own parse) when no renderer answers in time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginViewerFileOpen,
  getEngineThumbnail,
  registerEngineThumbnailRenderer,
  resolveViewerFileOpen,
  unregisterEngineThumbnailRenderer,
} from "@app/services/engineThumbnail";
import type { FileId } from "@app/types/file";

let sequence = 0;
const fileId = () => `file-${(sequence += 1)}` as FileId;
const docId = () => `doc-${(sequence += 1)}`;

const DATA_URL = "data:image/jpeg;base64,AAAA";

describe("engineThumbnail", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when nothing is registered", async () => {
    await expect(getEngineThumbnail(fileId())).resolves.toBeNull();
  });

  it("waits for the announced open, then renders the document", async () => {
    const id = fileId();
    beginViewerFileOpen(id);
    const render = vi.fn(async () => DATA_URL);
    const doc = docId();
    registerEngineThumbnailRenderer(doc, render);

    const pending = getEngineThumbnail(id, 1000);
    await expect(
      Promise.race([pending, Promise.resolve("early")]),
    ).resolves.toBe("early");

    resolveViewerFileOpen(id, doc);
    await expect(pending).resolves.toBe(DATA_URL);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders an already-open file without waiting", async () => {
    const id = fileId();
    const doc = docId();
    resolveViewerFileOpen(id, doc);
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);
    await expect(getEngineThumbnail(id, 1000)).resolves.toBe(DATA_URL);
  });

  it("gives up after the cap when the open never reports", async () => {
    vi.useFakeTimers();
    try {
      const id = fileId();
      beginViewerFileOpen(id);
      registerEngineThumbnailRenderer(docId(), async () => DATA_URL);

      const pending = getEngineThumbnail(id, 100);
      resolveViewerFileOpen(id, null);
      await vi.advanceTimersByTimeAsync(12_500);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves a retry that lands after a first open reported nothing", async () => {
    const id = fileId();
    const doc = docId();
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);

    beginViewerFileOpen(id);
    const pending = getEngineThumbnail(id, 100);
    resolveViewerFileOpen(id, null);
    setTimeout(() => {
      beginViewerFileOpen(id);
      resolveViewerFileOpen(id, doc);
    }, 30);
    await expect(pending).resolves.toBe(DATA_URL);
  });

  it("keeps file ids apart", async () => {
    const opened = fileId();
    const other = fileId();
    const doc = docId();
    resolveViewerFileOpen(opened, doc);
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);
    await expect(getEngineThumbnail(other, 100)).resolves.toBeNull();
  });

  it("does not use a renderer registered for another document", async () => {
    const id = fileId();
    resolveViewerFileOpen(id, docId());
    registerEngineThumbnailRenderer(docId(), async () => DATA_URL);
    await expect(getEngineThumbnail(id, 1000)).resolves.toBeNull();
  });

  it("returns null when the renderer throws", async () => {
    const id = fileId();
    const doc = docId();
    resolveViewerFileOpen(id, doc);
    registerEngineThumbnailRenderer(doc, async () => {
      throw new Error("worker gone");
    });
    await expect(getEngineThumbnail(id)).resolves.toBeNull();
  });

  it("stops using a renderer once it is unregistered", async () => {
    const id = fileId();
    const doc = docId();
    resolveViewerFileOpen(id, doc);
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);
    unregisterEngineThumbnailRenderer(doc);
    await expect(getEngineThumbnail(id)).resolves.toBeNull();
  });

  it("gives up when no open is announced within the wait", async () => {
    const started = Date.now();
    await expect(getEngineThumbnail(fileId(), 120)).resolves.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it("picks up an open announced during the wait", async () => {
    const id = fileId();
    const doc = docId();
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);
    const pending = getEngineThumbnail(id, 1000);
    setTimeout(() => {
      beginViewerFileOpen(id);
      resolveViewerFileOpen(id, doc);
    }, 30);
    await expect(pending).resolves.toBe(DATA_URL);
  });

  it("re-announces a file whose previous open was abandoned", async () => {
    const id = fileId();
    beginViewerFileOpen(id);
    resolveViewerFileOpen(id, null);
    await expect(getEngineThumbnail(id, 100)).resolves.toBeNull();

    const doc = docId();
    beginViewerFileOpen(id);
    registerEngineThumbnailRenderer(doc, async () => DATA_URL);
    const pending = getEngineThumbnail(id, 1000);
    resolveViewerFileOpen(id, doc);
    await expect(pending).resolves.toBe(DATA_URL);
  });
});
