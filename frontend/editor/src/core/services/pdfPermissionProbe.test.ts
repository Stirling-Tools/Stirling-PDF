import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfErrorCode } from "@embedpdf/models";
import { probePdfPermissions } from "@app/services/pdfPermissionProbe";

const mocks = vi.hoisted(() => ({
  createPdfiumEngine: vi.fn(),
  startEagerWasmCompilation: vi.fn(),
}));

vi.mock("@embedpdf/engines/pdfium-worker-engine", () => ({
  createPdfiumEngine: mocks.createPdfiumEngine,
}));

vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmUrl: "/wasm/pdfium.wasm",
  startEagerWasmCompilation: mocks.startEagerWasmCompilation,
}));

function taskOf<T>(value: T): { toPromise: () => Promise<T> } {
  return { toPromise: () => Promise.resolve(value) };
}

function taskOfRejection(reason: unknown): { toPromise: () => Promise<never> } {
  return { toPromise: () => Promise.reject(reason) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const engine = {
  openDocumentBuffer: vi.fn(),
  getDocPermissions: vi.fn(),
  getSignatures: vi.fn(),
  closeDocument: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPdfiumEngine.mockReturnValue(engine);
  engine.openDocumentBuffer.mockReturnValue(
    taskOf({ id: "doc", pageCount: 1 }),
  );
  engine.getDocPermissions.mockReturnValue(taskOf(0));
  engine.getSignatures.mockReturnValue(taskOf([]));
  engine.closeDocument.mockReturnValue(taskOf(true));
});

describe("probePdfPermissions", () => {
  it("reads encryption state, permissions and signatures from the document", async () => {
    const document = {
      id: "doc",
      pageCount: 3,
      isEncrypted: true,
      isOwnerUnlocked: false,
      permissions: 16,
    };
    engine.openDocumentBuffer.mockReturnValue(taskOf(document));
    engine.getSignatures.mockReturnValue(taskOf([{ id: "signature" }]));

    await expect(
      probePdfPermissions(new File(["pdf"], "protected.pdf")),
    ).resolves.toEqual({
      encrypted: true,
      requiresOpeningPassword: false,
      permissions: 16,
      ownerAuthenticated: false,
      pageCount: 3,
      signed: true,
    });
    expect(engine.getDocPermissions).not.toHaveBeenCalled();
    expect(engine.closeDocument).toHaveBeenCalledWith(document);
  });

  it("falls back to getDocPermissions when the opened document omits the bits", async () => {
    const document = {
      id: "doc",
      pageCount: 1,
      isEncrypted: true,
      isOwnerUnlocked: true,
    };
    engine.openDocumentBuffer.mockReturnValue(taskOf(document));
    engine.getDocPermissions.mockReturnValue(taskOf(4));

    await expect(
      probePdfPermissions(new File(["pdf"], "owner-only.pdf")),
    ).resolves.toEqual({
      encrypted: true,
      requiresOpeningPassword: false,
      permissions: 4,
      ownerAuthenticated: true,
      pageCount: 1,
      signed: false,
    });
    expect(engine.getDocPermissions).toHaveBeenCalledWith(document);
  });

  it("reports password-required documents without reading signatures", async () => {
    engine.openDocumentBuffer.mockReturnValue(
      taskOfRejection({ code: PdfErrorCode.Password }),
    );

    await expect(
      probePdfPermissions(new File(["pdf"], "locked.pdf")),
    ).resolves.toEqual({
      encrypted: true,
      requiresOpeningPassword: true,
      permissions: 0,
      ownerAuthenticated: false,
      pageCount: 0,
      signed: false,
    });
    expect(engine.getSignatures).not.toHaveBeenCalled();
    expect(engine.closeDocument).not.toHaveBeenCalled();
  });

  it("returns null for unreadable files and caches the verdict", async () => {
    engine.openDocumentBuffer.mockReturnValue(
      taskOfRejection({ code: PdfErrorCode.WrongFormat }),
    );
    const file = new File(["not a pdf"], "broken.pdf");

    await expect(probePdfPermissions(file)).resolves.toBeNull();
    await expect(probePdfPermissions(file)).resolves.toBeNull();
    expect(engine.openDocumentBuffer).toHaveBeenCalledTimes(1);
  });

  it("shares one open between concurrent probes and reuses the snapshot", async () => {
    const pending = deferred<unknown>();
    engine.openDocumentBuffer.mockReturnValue({
      toPromise: () => pending.promise,
    });
    const file = new File(["pdf"], "shared.pdf");

    const first = probePdfPermissions(file);
    const second = probePdfPermissions(file);
    pending.resolve({
      id: "doc",
      pageCount: 2,
      isEncrypted: false,
      isOwnerUnlocked: false,
    });
    const [a, b] = await Promise.all([first, second]);
    await probePdfPermissions(file);

    expect(a).toBe(b);
    expect(a).toMatchObject({ pageCount: 2, encrypted: false });
    expect(engine.openDocumentBuffer).toHaveBeenCalledTimes(1);
  });
});
