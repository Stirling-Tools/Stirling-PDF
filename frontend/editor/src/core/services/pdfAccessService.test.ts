import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPdfAccess,
  bindPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
  ensureLocalPdfAccess,
  inspectLocalPdfAccess,
} from "@app/services/pdfAccessService";

import { preflightPdfOperation } from "@app/services/pdfSessionUnlock";
import { createStirlingFile } from "@app/types/fileContext";
import apiClient from "@app/services/apiClient";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));

const workers = vi.hoisted(
  () =>
    [] as {
      onmessage?: (event: {
        data: { access: PdfAccess } | { error: string; code: number };
      }) => void;
      onerror?: () => void;
      postMessage: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
    }[],
);

vi.mock("@app/workers/pdfAccessWorker?worker", () => ({
  default: class {
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  },
}));
vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmUrl: "/pdfium.wasm",
}));

const access: PdfAccess = {
  password: "reader",
  encrypted: true,
  ownerAuthenticated: false,
  signed: false,
  permissions: 0,
  pageCount: 1,
};

beforeEach(() => {
  clearPdfAccess();
  workers.length = 0;
});

describe("local inspection lifetime", () => {
  it("shares a worker without letting one consumer cancel another", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const first = new AbortController();
    const cancelled = inspectLocalPdfAccess(file, "reader", first.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    const retained = inspectLocalPdfAccess(file, "reader");
    expect(workers).toHaveLength(1);
    first.abort();
    await rejected;
    expect(workers[0].terminate).not.toHaveBeenCalled();
    workers[0].onmessage?.({ data: { access } });
    await expect(retained).resolves.toEqual(access);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(getPdfAccess(file)).toBeUndefined();
  });

  it("starts a new inspection after every consumer cancels", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const first = new AbortController();
    const cancelled = inspectLocalPdfAccess(file, "reader", first.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    first.abort();
    const retry = inspectLocalPdfAccess(file, "reader");
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({ data: { access } });
    await rejected;
    await expect(retry).resolves.toEqual(access);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("keeps different credentials in separate inspections", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const reader = inspectLocalPdfAccess(file, "reader");
    const owner = inspectLocalPdfAccess(file, "owner");
    expect(workers).toHaveLength(2);
    workers[0].onmessage?.({ data: { access } });
    workers[1].onmessage?.({
      data: {
        access: { ...access, password: "owner", ownerAuthenticated: true },
      },
    });
    await expect(reader).resolves.toMatchObject({
      password: "reader",
      ownerAuthenticated: false,
    });
    await expect(owner).resolves.toMatchObject({
      password: "owner",
      ownerAuthenticated: true,
    });
  });

  it("reuses access without reading the file or creating a worker", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const stored = rememberPdfAccess(file, access);
    expect(await ensureLocalPdfAccess(file)).toBe(stored);
    expect(workers).toHaveLength(0);
  });

  it("releases the worker after publishing a local inspection", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const result = ensureLocalPdfAccess(file);
    expect(getPdfAccess(file)).toBeUndefined();
    workers[0].onmessage?.({ data: { access } });
    await expect(result).resolves.toMatchObject(access);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it.each(["abort", "logout", "close", "replace"])(
    "discards credentials and terminates work on %s",
    async (action) => {
      const file = createStirlingFile(new File(["PDF"], "protected.pdf"));
      bindPdfAccess(file, file.fileId);
      const controller = new AbortController();
      const result = ensureLocalPdfAccess(file, controller.signal);
      const rejected = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      if (action === "abort") controller.abort();
      else if (action === "close") forgetPdfAccess([file.fileId]);
      else if (action === "replace")
        bindPdfAccess(new File(["replacement"], file.name), file.fileId);
      else clearPdfAccess();
      await rejected;
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      workers[0].onmessage?.({ data: { access } });
      expect(getPdfAccess(file)).toBeUndefined();
    },
  );

  it("preflights uncached tool inputs locally and reuses the result", async () => {
    const file = createStirlingFile(new File(["PDF"], "protected.pdf"));
    const ownerPrompt = vi.fn();
    const preflight = () =>
      preflightPdfOperation(
        [file],
        "/api/v1/general/rotate-pdf",
        false,
        ownerPrompt,
      );
    const pending = preflight();
    workers[0].onmessage?.({
      data: { access: { ...access, permissions: -4 } },
    });
    await expect(pending).resolves.toBe(true);
    await expect(preflight()).resolves.toBe(true);
    expect(workers).toHaveLength(1);
    expect(ownerPrompt).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("preserves password error classification and permits retry", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const failed = inspectLocalPdfAccess(file, "incorrect");
    const rejected = expect(failed).rejects.toMatchObject({ code: 4 });
    workers[0].onmessage?.({ data: { error: "Unable to open PDF", code: 4 } });
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const retry = inspectLocalPdfAccess(file, "reader");
    workers[1].onmessage?.({ data: { access } });
    await expect(retry).resolves.toEqual(access);
    expect(getPdfAccess(file)).toBeUndefined();
  });
});
