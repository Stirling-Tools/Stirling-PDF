import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import {
  ensureLocalPdfAccess,
  inspectLocalPdfAccess,
} from "@app/services/pdfLocalAccess";

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
  canModify: false,
  canAssemble: false,
  pageCount: 1,
  localInspection: true,
};

beforeEach(() => {
  clearPdfAccess();
  workers.length = 0;
});

describe("local inspection lifetime", () => {
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

  it.each(["abort", "logout"])(
    "discards credentials and terminates work on %s",
    async (action) => {
      const file = new File(["PDF"], "protected.pdf");
      const controller = new AbortController();
      const result = ensureLocalPdfAccess(file, controller.signal);
      const rejected = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      if (action === "abort") controller.abort();
      else clearPdfAccess();
      await rejected;
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(getPdfAccess(file)).toBeUndefined();
    },
  );

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
