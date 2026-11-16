import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AxiosRequestConfig } from "axios";
import { expectConsole } from "@editor/tests/failOnConsole";
import { rememberUnprotectedPdf } from "@editor/tests/utils/testFileHelpers";
import type { StirlingFile } from "@editor/types/fileContext";
import {
  inspectLocalPdfAccess,
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  bindPdfAccess,
  forgetPdfAccess,
  setPdfAccessPolicy,
  type PdfAccess,
} from "@editor/services/pdfAccessService";

// One bad file in a batch must come back named, with its error: the caller reports each one,
// and it cannot derive the failure kind without the error the request threw.

const post = vi.fn();
vi.mock("@editor/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: vi.fn(),
}));
const inspectLocal = vi.mocked(inspectLocalPdfAccess);
const plainAccess: PdfAccess = {
  password: "",
  encrypted: false,
  signed: false,
  ownerAuthenticated: false,
  permissions: -4,
  pageCount: 1,
};

// Mirrors the response body, so a 0-byte answer really does produce an empty output.
vi.mock("@editor/utils/toolResponseProcessor", () => ({
  processResponse: (blob: Blob, files: { name: string }[]) =>
    Promise.resolve([new File([blob], `out-${files[0].name}`)]),
}));

const { useToolApiCalls } =
  await import("@editor/hooks/tools/shared/useToolApiCalls");

const file = (name: string, id: string): StirlingFile =>
  Object.assign(
    rememberUnprotectedPdf(
      new File(["test"], name, { type: "application/pdf" }),
    ),
    { fileId: id },
  ) as StirlingFile;

function run(files: StirlingFile[]) {
  const { processFiles } = renderHook(() => useToolApiCalls()).result.current;
  return processFiles(
    undefined,
    files,
    {
      endpoint: "/api/v1/misc/compress-pdf",
      buildFormData: () => new FormData(),
    },
    () => {},
    () => {},
  );
}

beforeEach(() => {
  post.mockReset();
  inspectLocal.mockReset();
  clearPdfAccess();
  setPdfAccessPolicy(undefined);
});

describe("processFiles failure reporting", () => {
  it.each(["active", "completed", "queued"])(
    "closing a %s file preserves the other batch results",
    async (closed) => {
      const inputs = [
        file("a.pdf", "a"),
        file("b.pdf", "b"),
        file("c.pdf", "c"),
      ];
      inputs.forEach((input) => bindPdfAccess(input, input.fileId));
      let completeRequest!: () => void;
      post.mockResolvedValue({ data: new Blob(["output"]), status: 200 });
      post.mockResolvedValueOnce({
        data: new Blob(["first output"]),
        status: 200,
      });
      post.mockImplementationOnce(
        (_endpoint, _form, config: AxiosRequestConfig) =>
          new Promise((resolve, reject) => {
            completeRequest = () =>
              resolve({ data: new Blob(["second output"]), status: 200 });
            config.signal?.addEventListener?.(
              "abort",
              () => reject(new DOMException("Closed", "AbortError")),
              { once: true },
            );
          }),
      );
      const { result } = renderHook(() => useToolApiCalls());
      const markFileError = vi.fn();
      const processing = result.current.processFiles(
        undefined,
        inputs,
        {
          endpoint: "/api/v1/misc/compress-pdf",
          buildFormData: () => new FormData(),
        },
        vi.fn(),
        vi.fn(),
        markFileError,
      );
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
      const closedId =
        closed === "active" ? "b" : closed === "completed" ? "a" : "c";
      forgetPdfAccess([closedId]);
      completeRequest();
      const output = await processing;
      expect(output.successSourceIds).toEqual(
        inputs.map((input) => input.fileId).filter((id) => id !== closedId),
      );
      expect(output.outputFiles).toHaveLength(2);
      expect(output.unprocessedSourceIds).toEqual([closedId]);
      expect(output.failedInputs).toEqual([]);
      expect(markFileError).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(closed === "queued" ? 2 : 3);
    },
  );

  it("applies the server policy to protection added to a plain source", async () => {
    const input = file("source.pdf", "source");
    expect(getPdfAccess(input)?.honorOwnerPasswords).toBeUndefined();
    setPdfAccessPolicy(false);
    post.mockResolvedValue({ data: new Blob(["protected"]), status: 200 });
    inspectLocal.mockResolvedValue({
      ...plainAccess,
      encrypted: true,
      password: "reader",
      permissions: 0,
    });
    const { result } = renderHook(() => useToolApiCalls());
    try {
      const output = await result.current.processFiles(
        undefined,
        [input],
        {
          endpoint: "/api/v1/security/add-password",
          buildFormData: () => {
            const form = new FormData();
            form.set("keyLength", "256");
            form.set("password", "reader");
            return form;
          },
        },
        vi.fn(),
        vi.fn(),
      );
      expect(getPdfAccess(output.outputFiles[0])).toMatchObject({
        encrypted: true,
        ownerAuthenticated: false,
        honorOwnerPasswords: false,
      });
      const { preflightPdfOperation } =
        await import("@editor/services/pdfSessionUnlock");
      const requestOwner = vi.fn().mockResolvedValue(false);
      const nextInput = Object.assign(output.outputFiles[0], {
        fileId: "output",
      }) as StirlingFile;
      expect(
        await preflightPdfOperation(
          [nextInput],
          "/api/v1/misc/compress-pdf",
          false,
          requestOwner,
        ),
      ).toBe(true);
      expect(requestOwner).not.toHaveBeenCalled();
    } finally {
      setPdfAccessPolicy(undefined);
    }
  });

  it.each([
    ["add-password", "cancel"],
    ["remove-password", "cancel"],
    ["add-password", "navigation"],
    ["remove-password", "navigation"],
  ])(
    "handles %s results on %s during local result adoption",
    async (operation, stop) => {
      post.mockResolvedValue({ data: new Blob(["result"]), status: 200 });
      let completeInspection!: () => void;
      inspectLocal
        .mockResolvedValue(plainAccess)
        .mockImplementationOnce(async (_output, _password, signal) => {
          expect(signal).toBeDefined();
          return new Promise((resolve) => {
            completeInspection = () => resolve(plainAccess);
          });
        });
      const { result, unmount } = renderHook(() => useToolApiCalls());
      const markFileError = vi.fn();
      const processing = result.current.processFiles(
        undefined,
        [file("a.pdf", "a"), file("b.pdf", "b")],
        {
          endpoint: `/api/v1/security/${operation}`,
          buildFormData: () => {
            const form = new FormData();
            form.set("keyLength", "256");
            return form;
          },
        },
        vi.fn(),
        vi.fn(),
        markFileError,
      );
      const outcome =
        stop === "cancel"
          ? expect(processing).rejects.toThrow("Operation was cancelled")
          : expect(processing).resolves.toMatchObject({
              successSourceIds: ["a", "b"],
            });
      await vi.waitFor(() => expect(inspectLocal).toHaveBeenCalledOnce());
      if (stop === "navigation") {
        unmount();
      } else result.current.cancelOperation();
      completeInspection();
      await outcome;
      expect(post).toHaveBeenCalledTimes(stop === "cancel" ? 1 : 2);
      expect(markFileError).not.toHaveBeenCalled();
      if (stop === "cancel")
        expect(getPdfAccess(inspectLocal.mock.calls[0][0])).toBeUndefined();
      else
        expect(getPdfAccess(inspectLocal.mock.calls[0][0])).toMatchObject(
          plainAccess,
        );
    },
  );

  it.each(["navigation", "logout"])(
    "handles %s during an unencrypted batch",
    async (stop) => {
      let completeRequest!: () => void;
      post.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeRequest = () =>
              resolve({ data: new Blob(["first output"]), status: 200 });
          }),
      );
      post.mockResolvedValueOnce({
        data: new Blob(["second output"]),
        status: 200,
      });
      const { result, unmount } = renderHook(() => useToolApiCalls());
      const processing = result.current.processFiles(
        undefined,
        [file("a.pdf", "a"), file("b.pdf", "b")],
        {
          endpoint: "/api/v1/misc/compress-pdf",
          buildFormData: () => new FormData(),
        },
        vi.fn(),
        vi.fn(),
        vi.fn(),
      );
      await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
      unmount();
      expect(post.mock.calls[0][2].cancelToken.reason).toBeUndefined();
      expect(post.mock.calls[0][2].signal.aborted).toBe(false);
      const outcome =
        stop === "logout"
          ? expect(processing).rejects.toThrow("Operation was cancelled")
          : expect(processing).resolves.toMatchObject({
              successSourceIds: ["a", "b"],
            });
      if (stop === "logout") clearPdfAccess();
      completeRequest();
      await outcome;
      expect(post).toHaveBeenCalledTimes(stop === "logout" ? 1 : 2);
      expect(inspectLocal).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["add-password", false, "reader"],
    ["add-password", true, "reader"],
    ["remove-password", false, ""],
  ])(
    "adopts %s results locally with preserveExisting=%s",
    async (operation, preserveExisting, password) => {
      setPdfAccessPolicy(false);
      const input = file("source.pdf", "source");
      rememberPdfAccess(input, {
        ...getPdfAccess(input)!,
        encrypted: true,
        password: "owner",
        openingPassword: "reader",
        ownerAuthenticated: true,
      });
      post.mockResolvedValue({ data: new Blob(["output"]), status: 200 });
      inspectLocal.mockImplementation(async (_output, credential) => ({
        ...plainAccess,
        encrypted: credential !== "",
        password: credential ?? "",
      }));
      const { result } = renderHook(() => useToolApiCalls());
      const processed = await result.current.processFiles(
        undefined,
        [input],
        {
          endpoint: `/api/v1/security/${operation}`,
          buildFormData: () => {
            const form = new FormData();
            form.set("password", "reader");
            if (!preserveExisting) form.set("keyLength", "256");
            return form;
          },
        },
        vi.fn(),
        vi.fn(),
      );
      expect(processed.outputFiles).toHaveLength(1);
      expect(post).toHaveBeenCalledOnce();
      expect(post.mock.calls[0][0]).toBe(`/api/v1/security/${operation}`);
      expect(inspectLocal).toHaveBeenCalledWith(
        processed.outputFiles[0],
        password,
        expect.any(AbortSignal),
      );
      expect(getPdfAccess(processed.outputFiles[0])).toMatchObject({
        password,
        honorOwnerPasswords: false,
      });
    },
  );

  it.each([
    "/api/v1/security/add-password",
    "/api/v1/security/remove-password",
    "/api/v1/misc/compress-pdf",
  ])(
    "cancels %s without processing the remaining batch or marking files as failed",
    async (endpoint) => {
      post.mockImplementation(
        (_endpoint: string, _form: FormData, config: AxiosRequestConfig) =>
          new Promise((_resolve, reject) => {
            config.cancelToken?.promise.then(reject);
          }),
      );
      const { result } = renderHook(() => useToolApiCalls());
      const markFileError = vi.fn();
      const processing = result.current.processFiles(
        undefined,
        [file("a.pdf", "a"), file("b.pdf", "b")],
        {
          endpoint,
          buildFormData: () => {
            const form = new FormData();
            form.set("keyLength", "256");
            return form;
          },
        },
        vi.fn(),
        vi.fn(),
        markFileError,
      );
      const cancelled = expect(processing).rejects.toThrow(
        "Operation was cancelled",
      );
      await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
      result.current.cancelOperation();
      await cancelled;
      expect(post).toHaveBeenCalledOnce();
      expect(markFileError).not.toHaveBeenCalled();
    },
  );

  it("stops at a signup gate without labelling the files as failed", async () => {
    const blocked = {
      response: { status: 401, data: { error: "SIGNUP_REQUIRED" } },
    };
    post.mockRejectedValue(blocked);
    await expect(run([file("a.pdf", "a"), file("b.pdf", "b")])).rejects.toBe(
      blocked,
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("keeps successful batch outputs when a later input reaches the guest limit", async () => {
    post.mockResolvedValueOnce({
      data: new Blob(["ok"]),
      status: 200,
      headers: {},
    });
    post.mockRejectedValue({
      response: { status: 401, data: { error: "SIGNUP_REQUIRED" } },
    });
    const result = await run([
      file("a.pdf", "a"),
      file("b.pdf", "b"),
      file("c.pdf", "c"),
    ]);
    expect(result.outputFiles).toHaveLength(1);
    expect(result.successSourceIds).toEqual(["a"]);
    expect(result.failedInputs).toEqual([]);
    expect(result.unprocessedSourceIds).toEqual(["b", "c"]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("names the failed input and keeps its error while the rest succeed", async () => {
    expectConsole.error("[processFiles] Failed");
    const boom = new Error("corrupted");
    let call = 0;
    post.mockImplementation(() => {
      call += 1;
      return call === 2
        ? Promise.reject(boom)
        : Promise.resolve({ data: new Blob(["ok"]), status: 200, headers: {} });
    });

    const result = await run([
      file("a.pdf", "f-a"),
      file("bad.pdf", "f-bad"),
      file("c.pdf", "f-c"),
    ]);

    expect(result.outputFiles).toHaveLength(2);
    expect(result.successSourceIds).toEqual(["f-a", "f-c"]);
    expect(result.failedInputs).toEqual([
      { fileId: "f-bad", name: "bad.pdf", error: boom },
    ]);
  });

  it("reports nothing when every input succeeded", async () => {
    post.mockResolvedValue({
      data: new Blob(["ok"]),
      status: 200,
      headers: {},
    });

    const result = await run([file("a.pdf", "f-a")]);

    expect(result.failedInputs).toEqual([]);
  });

  it("treats an empty output as a failure the caller must hear about", async () => {
    // A 200 with a 0-byte body is a failure the old code counted only in a status string.
    expectConsole.warn("[processFiles] Empty output treated as failure");
    let call = 0;
    post.mockImplementation(() => {
      call += 1;
      return Promise.resolve({
        data: new Blob(call === 1 ? ["ok"] : []),
        status: 200,
        headers: {},
      });
    });

    const result = await run([file("a.pdf", "f-a"), file("empty.pdf", "f-e")]);

    expect(result.successSourceIds).toEqual(["f-a"]);
    expect(result.failedInputs.map((f) => f.fileId)).toEqual(["f-e"]);
  });
});
