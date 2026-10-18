import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfErrorCode } from "@embedpdf/models";

const engineMock = vi.hoisted(() => ({ createPdfiumEngine: vi.fn() }));

vi.mock("@embedpdf/engines/pdfium-worker-engine", () => ({
  createPdfiumEngine: engineMock.createPdfiumEngine,
}));

vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmUrl: "/wasm/pdfium.wasm",
  startEagerWasmCompilation: vi.fn(),
}));

type ProbeModule = typeof import("@app/services/pdfPermissionProbe");

const taskOf = <T>(value: T) => ({ toPromise: () => Promise.resolve(value) });
const taskOfRejection = (error: unknown) => ({
  toPromise: () => Promise.reject(error),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const openableDocument = (overrides: Record<string, unknown> = {}) => ({
  id: "document",
  pageCount: 3,
  pages: [],
  isEncrypted: true,
  isOwnerUnlocked: false,
  permissions: -1,
  normalizedRotation: 0,
  ...overrides,
});

function createEngine() {
  return {
    openDocumentBuffer: vi.fn(),
    getDocUserPermissions: vi.fn(),
    getSignatures: vi.fn(() => taskOf([])),
    closeDocument: vi.fn(() => taskOf(true)),
    destroy: vi.fn(() => taskOf(true)),
  };
}

let engine: ReturnType<typeof createEngine>;
let probePdfPermissions: ProbeModule["probePdfPermissions"];

beforeEach(async () => {
  vi.resetModules();
  ({ probePdfPermissions } = await import("@app/services/pdfPermissionProbe"));
  engine = createEngine();
  engineMock.createPdfiumEngine.mockReset();
  engineMock.createPdfiumEngine.mockReturnValue(engine);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("probePdfPermissions", () => {
  it("reads stored user restrictions and signature presence from one open", async () => {
    engine.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    engine.getDocUserPermissions.mockReturnValue(taskOf(0xfffffff4));
    engine.getSignatures.mockReturnValue(taskOf([{ id: "signature" }]));

    const snapshot = await probePdfPermissions(
      new File(["pdf"], "restricted.pdf"),
    );

    expect(snapshot).toEqual({
      encrypted: true,
      requiresOpeningPassword: false,
      permissions: -12,
      ownerAuthenticated: false,
      pageCount: 3,
      signed: true,
    });
    expect(engine.getDocUserPermissions).toHaveBeenCalledOnce();
    expect(engine.closeDocument).toHaveBeenCalledOnce();
  });

  it("keeps stored restrictions separate from owner authentication", async () => {
    engine.openDocumentBuffer.mockReturnValue(
      taskOf(openableDocument({ isOwnerUnlocked: true })),
    );
    engine.getDocUserPermissions.mockReturnValue(taskOf(0xfffffff8));

    const snapshot = await probePdfPermissions(new File(["pdf"], "owner.pdf"));

    expect(snapshot?.permissions).toBe(-8);
    expect(snapshot?.ownerAuthenticated).toBe(true);
  });

  it("reports password-required results and caches them", async () => {
    engine.openDocumentBuffer.mockReturnValue(
      taskOfRejection({ code: PdfErrorCode.Password }),
    );

    const file = new File(["pdf"], "locked.pdf");
    const snapshot = await probePdfPermissions(file);
    expect(snapshot?.requiresOpeningPassword).toBe(true);

    await probePdfPermissions(file);
    expect(engine.openDocumentBuffer).toHaveBeenCalledOnce();
  });

  it("settles metadata failures as unknown without caching them", async () => {
    engine.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    engine.getDocUserPermissions.mockReturnValue(
      taskOfRejection(new Error("engine gone")),
    );

    const file = new File(["pdf"], "flaky.pdf");
    expect(await probePdfPermissions(file)).toBeNull();
    expect(engine.closeDocument).toHaveBeenCalledOnce();

    engine.getDocUserPermissions.mockReturnValue(taskOf(-4));
    const retried = await probePdfPermissions(file);
    expect(retried?.permissions).toBe(-4);
    expect(engine.openDocumentBuffer).toHaveBeenCalledTimes(2);
  });

  it("lets the same file retry after a transient engine start failure", async () => {
    engineMock.createPdfiumEngine.mockImplementationOnce(() => {
      throw new Error("worker unavailable");
    });

    const file = new File(["pdf"], "retry.pdf");
    expect(await probePdfPermissions(file)).toBeNull();

    engine.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    engine.getDocUserPermissions.mockReturnValue(taskOf(-4));
    const snapshot = await probePdfPermissions(file);
    expect(snapshot?.encrypted).toBe(true);
    expect(engineMock.createPdfiumEngine).toHaveBeenCalledTimes(2);
  });

  it("runs one probe at a time across files", async () => {
    const first = deferred<ReturnType<typeof openableDocument>>();
    const second = deferred<ReturnType<typeof openableDocument>>();
    engine.openDocumentBuffer
      .mockReturnValueOnce({ toPromise: () => first.promise })
      .mockReturnValueOnce({ toPromise: () => second.promise });
    engine.getDocUserPermissions.mockReturnValue(taskOf(-4));

    const probeA = probePdfPermissions(new File(["a"], "a.pdf"));
    const probeB = probePdfPermissions(new File(["b"], "b.pdf"));
    await vi.waitFor(() =>
      expect(engine.openDocumentBuffer).toHaveBeenCalledOnce(),
    );

    first.resolve(openableDocument());
    await vi.waitFor(() =>
      expect(engine.openDocumentBuffer).toHaveBeenCalledTimes(2),
    );

    second.resolve(openableDocument());
    await Promise.all([probeA, probeB]);
  });

  it("settles a stalled probe as unknown, drops the engine and recovers", async () => {
    vi.useFakeTimers();
    engine.openDocumentBuffer.mockReturnValue({
      toPromise: () => new Promise(() => {}),
    });

    const probe = probePdfPermissions(new File(["pdf"], "stalled.pdf"));
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await probe;
    vi.useRealTimers();

    expect(result).toBeNull();
    await vi.waitFor(() => expect(engine.destroy).toHaveBeenCalled());

    const fresh = createEngine();
    fresh.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    fresh.getDocUserPermissions.mockReturnValue(taskOf(-4));
    engineMock.createPdfiumEngine.mockReturnValue(fresh);
    const snapshot = await probePdfPermissions(new File(["pdf"], "next.pdf"));
    expect(snapshot?.encrypted).toBe(true);
    expect(engineMock.createPdfiumEngine).toHaveBeenCalledTimes(2);
  });

  it("returns the snapshot but drops the engine when the close fails", async () => {
    engine.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    engine.getDocUserPermissions.mockReturnValue(taskOf(-4));
    engine.closeDocument.mockReturnValue(
      taskOfRejection(new Error("close failed")),
    );

    const snapshot = await probePdfPermissions(
      new File(["pdf"], "close-fail.pdf"),
    );

    expect(snapshot?.permissions).toBe(-4);
    await vi.waitFor(() => expect(engine.destroy).toHaveBeenCalled());
  });

  it("shares one open between concurrent callers", async () => {
    engine.openDocumentBuffer.mockReturnValue(taskOf(openableDocument()));
    engine.getDocUserPermissions.mockReturnValue(taskOf(-4));

    const file = new File(["pdf"], "shared.pdf");
    const [a, b] = await Promise.all([
      probePdfPermissions(file),
      probePdfPermissions(file),
    ]);

    expect(a).toBe(b);
    expect(engine.openDocumentBuffer).toHaveBeenCalledOnce();
  });
});
