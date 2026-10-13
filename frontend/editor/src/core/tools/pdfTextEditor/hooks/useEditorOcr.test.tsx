import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { useEditorOcr } from "@app/tools/pdfTextEditor/hooks/useEditorOcr";
import type { FileId } from "@app/types/file";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  exportPdf: vi.fn(),
  checkCredits: vi.fn(),
  ensureReady: vi.fn(),
  assertAllowed: vi.fn(),
  extractZipFiles: vi.fn(),
  enabled: true as boolean | null,
  locale: "en-GB",
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: mocks.get, post: mocks.post },
}));
vi.mock("@app/services/backendReadinessGuard", () => ({
  ensureBackendReady: mocks.ensureReady,
}));
vi.mock("@app/services/policyFileGuard", () => ({
  assertFilesNotBlocked: mocks.assertAllowed,
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: mocks.enabled }),
}));
vi.mock("@app/hooks/useCreditCheck", () => ({
  useCreditCheck: () => ({ checkCredits: mocks.checkCredits }),
}));
vi.mock("@app/hooks/tools/shared/useToolResources", () => ({
  useToolResources: () => ({ extractZipFiles: mocks.extractZipFiles }),
}));
vi.mock("@app/tools/pdfTextEditor/util/exportPdf", () => ({
  exportToBlob: mocks.exportPdf,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: mocks.locale },
  }),
}));

function makeDoc(): EditorDocument {
  return {
    pageCount: 0,
    loadedPages: () => [],
    dispose: vi.fn(),
  } as unknown as EditorDocument;
}

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup() {
  const store = new EditorStore();
  await store.setDocument(makeDoc());
  const onComplete = vi.fn(async (_file: File, isCurrent: () => boolean) => {
    expect(isCurrent()).toBe(true);
  });
  const hook = renderHook(() =>
    useEditorOcr({
      store,
      fileName: "scan.pdf",
      fileId: "source-id" as FileId,
      onComplete,
    }),
  );
  return { ...hook, store, onComplete };
}

describe("editor inline OCR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.locale = "en-GB";
    mocks.get.mockResolvedValue({ data: { languages: ["eng", "deu", "osd"] } });
    mocks.post.mockResolvedValue({
      data: new Blob(["%PDF-1.7\nOCR result"], { type: "application/pdf" }),
    });
    mocks.exportPdf.mockResolvedValue({
      blob: new Blob(["%PDF-1.7\ncurrent edits"], { type: "application/pdf" }),
      filename: "scan_edited.pdf",
    });
    mocks.checkCredits.mockResolvedValue(null);
    mocks.ensureReady.mockResolvedValue(true);
    mocks.assertAllowed.mockImplementation(() => {});
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(
      function (this: Blob) {
        return readBytes(this);
      },
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("posts the current editor bytes through the app client and applies the OCR PDF", async () => {
    mocks.locale = "de-DE";
    const { result, store, onComplete } = await setup();
    await act(() => result.current.runOcr());

    expect(mocks.ensureReady).toHaveBeenCalledWith("/api/v1/misc/ocr-pdf");
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/v1/ui-data/ocr-pdf",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const [endpoint, body, config] = mocks.post.mock.calls[0];
    expect(endpoint).toBe("/api/v1/misc/ocr-pdf");
    expect(config).toMatchObject({ responseType: "blob", timeout: 0 });
    expect(body.getAll("languages")).toEqual(["deu"]);
    expect(body.get("ocrType")).toBe("skip-text");
    expect(body.get("ocrRenderType")).toBe("hocr");
    expect(body.get("sidecar")).toBe("false");
    expect(body.get("removeImagesAfter")).toBe("false");
    const uploaded = body.get("fileInput") as File;
    expect(uploaded.name).toBe("scan.pdf");
    expect(new TextDecoder().decode(await readBytes(uploaded))).toContain(
      "current edits",
    );
    expect(mocks.exportPdf).toHaveBeenCalledWith(store.document, "scan.pdf");
    const output = onComplete.mock.calls[0][0];
    expect(output.name).toBe("scan.pdf");
    expect(new TextDecoder().decode(await readBytes(output))).toContain(
      "OCR result",
    );
    expect(store.getState()).toMatchObject({ loading: false, error: null });
    expect(result.current.running).toBe(false);
  });

  it.each([
    [["eng", "fra", "osd"], "eng"],
    [["fra", "osd"], "fra"],
  ])(
    "uses an installed fallback language from %s",
    async (languages, expected) => {
      mocks.locale = "ja-JP";
      mocks.get.mockResolvedValue({ data: { languages } });
      const { result } = await setup();
      await act(() => result.current.runOcr());
      expect(mocks.post.mock.calls[0][1].getAll("languages")).toEqual([
        expected,
      ]);
    },
  );

  it("rejects an empty language list without uploading or replacing the document", async () => {
    mocks.get.mockResolvedValue({ data: { languages: ["osd"] } });
    const { result, store, onComplete } = await setup();
    const document = store.document;
    await act(() => result.current.runOcr());
    expect(mocks.post).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(store.document).toBe(document);
    expect(store.getState()).toMatchObject({
      loading: false,
      error: "No OCR languages are installed on the server.",
    });
  });

  it("retains the document after failure and allows one-click retry", async () => {
    const { result, store, onComplete } = await setup();
    const document = store.document;
    mocks.post.mockRejectedValueOnce(new Error("OCR failed"));
    await act(() => result.current.runOcr());
    expect(store.document).toBe(document);
    expect(store.getState().error).toBe("OCR failed");
    expect(onComplete).not.toHaveBeenCalled();
    await act(() => result.current.runOcr());
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(store.getState().error).toBeNull();
  });

  it("does not accept an error page as an OCR PDF", async () => {
    mocks.post.mockResolvedValue({
      data: new Blob(["<html><title>OCR unavailable</title></html>"]),
    });
    const { result, store, onComplete } = await setup();
    await act(() => result.current.runOcr());
    expect(onComplete).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      loading: false,
      error: "OCR service error: OCR unavailable",
    });
  });

  it("prevents double-click submissions while OCR is pending", async () => {
    const response = deferred<{ data: Blob }>();
    mocks.post.mockReturnValue(response.promise);
    const { result, onComplete } = await setup();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runOcr();
    });
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(result.current.running).toBe(true);
    await act(() => result.current.runOcr());
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve({ data: new Blob(["%PDF-1.7"]) });
      await pending;
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("aborts a stale request and leaves a newer document's loading state alone", async () => {
    const response = deferred<{ data: Blob }>();
    mocks.post.mockReturnValue(response.promise);
    const { result, store, onComplete } = await setup();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runOcr();
    });
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const signal = mocks.post.mock.calls[0][2].signal as AbortSignal;
    await act(async () => {
      store.beginLoad();
      await store.setDocument(makeDoc());
      store.setLoading(true);
      response.resolve({ data: new Blob(["%PDF-1.7"]) });
      await pending;
    });
    expect(signal.aborted).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(store.getState().loading).toBe(true);
    store.setLoading(false);
  });

  it("does not overwrite edits made while OCR was pending", async () => {
    const response = deferred<{ data: Blob }>();
    mocks.post.mockReturnValue(response.promise);
    const { result, store, onComplete } = await setup();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runOcr();
    });
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    await act(async () => {
      store.dispatch({ type: "edit", apply: vi.fn(), revert: vi.fn() });
      response.resolve({ data: new Blob(["%PDF-1.7"]) });
      await pending;
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      loading: false,
      dirty: true,
      error: expect.stringContaining("document changed"),
    });
    expect(mocks.post.mock.calls[0][2].signal.aborted).toBe(true);
  });

  it("blocks uploads when file policy changes during export", async () => {
    mocks.exportPdf.mockImplementation(async () => {
      mocks.assertAllowed.mockImplementation(() => {
        throw new Error("File blocked");
      });
      return { blob: new Blob(["%PDF-1.7"]), filename: "scan.pdf" };
    });
    const { result, store } = await setup();
    await act(() => result.current.runOcr());
    expect(mocks.post).not.toHaveBeenCalled();
    expect(store.getState().error).toBe("File blocked");
  });

  it("aborts on unmount and releases loading so the editor can be reopened", async () => {
    const response = deferred<{ data: Blob }>();
    mocks.post.mockReturnValue(response.promise);
    const { result, store, unmount, onComplete } = await setup();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runOcr();
    });
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    unmount();
    expect(mocks.post.mock.calls[0][2].signal.aborted).toBe(true);
    expect(store.getState().loading).toBe(false);
    response.resolve({ data: new Blob(["%PDF-1.7"]) });
    await pending;
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each([false, null])(
    "does not run when endpoint availability is %s",
    async (enabled) => {
      mocks.enabled = enabled;
      const { result } = await setup();
      await act(() => result.current.runOcr());
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
      expect(result.current.available).toBe(enabled);
    },
  );
});
