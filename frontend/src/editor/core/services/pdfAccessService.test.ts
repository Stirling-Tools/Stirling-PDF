import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPdfAccess,
  bindPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
  ensureLocalPdfAccess,
  inspectLocalPdfAccess,
  setPdfAccessPolicy,
  subscribePdfAccess,
} from "@editor/services/pdfAccessService";

import { preflightPdfOperation } from "@editor/services/pdfSessionUnlock";
import { createStirlingFile } from "@editor/types/fileContext";
import apiClient from "@editor/services/apiClient";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));

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

vi.mock("@editor/workers/pdfAccessWorker?worker", () => ({
  default: class {
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  },
}));
vi.mock("@editor/services/wasmPrecompiler", () => ({
  pdfiumWasmUrl: "/pdfium.wasm",
  pdfiumWasmModulePromise: Promise.resolve("precompiled-module"),
  startEagerWasmCompilation: vi.fn(),
}));

const access: PdfAccess = {
  password: "reader",
  encrypted: true,
  ownerAuthenticated: false,
  signed: false,
  permissions: 0,
  pageCount: 1,
};

const nativeAny = AbortSignal.any;
beforeEach(() => {
  Object.defineProperty(AbortSignal, "any", { value: undefined });
  clearPdfAccess();
  setPdfAccessPolicy(undefined);
  workers.length = 0;
});
afterEach(() => {
  clearPdfAccess();
  setPdfAccessPolicy(undefined);
  Object.defineProperty(AbortSignal, "any", { value: nativeAny });
  vi.useRealTimers();
});

describe("local inspection lifetime", () => {
  it("applies active policy to fresh inspections and subsequent policy changes", async () => {
    const file = new File(["PDF"], "source.pdf", { type: "application/pdf" });
    setPdfAccessPolicy(false);
    const pending = ensureLocalPdfAccess(file);
    workers[0].onmessage?.({ data: { access } });
    const inspected = await pending;
    expect(inspected.honorOwnerPasswords).toBe(false);
    expect(getPdfAccess(file)).toBe(inspected);
    const changed = vi.fn();
    const unsubscribe = subscribePdfAccess(changed);
    try {
      setPdfAccessPolicy(true);
      expect(changed).toHaveBeenCalledOnce();
      const restricted = getPdfAccess(file);
      expect(restricted?.honorOwnerPasswords).toBe(true);
      expect(restricted?.ownerAuthenticated).toBe(false);
      expect(getPdfAccess(file)).toBe(restricted);
      expect(
        rememberPdfAccess(file, { ...access, honorOwnerPasswords: false })
          .honorOwnerPasswords,
      ).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it("passes the compiled module to the worker", async () => {
    const file = new File(["PDF"], "plain.pdf");
    const result = inspectLocalPdfAccess(file);
    await vi.waitFor(() =>
      expect(workers[0].postMessage).toHaveBeenCalledWith({
        file,
        password: "",
        wasmUrl: "/pdfium.wasm",
        wasmModule: "precompiled-module",
      }),
    );
    workers[0].onmessage?.({ data: { access } });
    await result;
  });

  it("bounds concurrent inspections and drops a cancelled queued file", async () => {
    const files = Array.from(
      { length: 4 },
      (_, i) => new File(["PDF"], `${i}.pdf`),
    );
    const controller = new AbortController();
    const results = files.map((file, i) =>
      inspectLocalPdfAccess(file, "", i === 2 ? controller.signal : undefined),
    );
    const cancelled = expect(results[2]).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(workers).toHaveLength(2);
    controller.abort();
    await cancelled;
    workers[0].onmessage?.({ data: { access } });
    expect(workers).toHaveLength(3);
    await vi.waitFor(() =>
      expect(workers[2].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ file: files[3] }),
      ),
    );
    workers[1].onmessage?.({ data: { access } });
    workers[2].onmessage?.({ data: { access } });
    await Promise.all([results[0], results[1], results[3]]);
  });

  it("still verifies files over 100 MiB, with no other inspection heap active", async () => {
    const file = new File(["PDF"], "large.pdf");
    Object.defineProperty(file, "size", { value: 150 * 1024 * 1024 });
    const large = ensureLocalPdfAccess(file);
    const small = inspectLocalPdfAccess(new File(["PDF"], "small.pdf"));
    expect(workers).toHaveLength(1);
    expect(getPdfAccess(file)).toBeUndefined();
    workers[0].onmessage?.({ data: { access } });
    await expect(large).resolves.toMatchObject({ encrypted: true });
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({ data: { access } });
    await small;
  });

  it("terminates stalled inspection, releases its slot, and leaves access unknown", async () => {
    vi.useFakeTimers();
    const file = new File(["PDF"], "stalled.pdf");
    Object.defineProperty(file, "size", { value: 150 * 1024 * 1024 });
    const stalled = ensureLocalPdfAccess(file);
    const failure = expect(stalled).rejects.toMatchObject({
      name: "TimeoutError",
    });
    const next = inspectLocalPdfAccess(new File(["PDF"], "next.pdf"));
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    workers[0].onmessage?.({ data: { access } });
    expect(getPdfAccess(file)).toBeUndefined();
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({ data: { access } });
    await next;
  });
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
