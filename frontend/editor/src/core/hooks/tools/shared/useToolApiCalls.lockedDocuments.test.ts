import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { expectConsole } from "@app/tests/failOnConsole";
import type { StirlingFile } from "@app/types/fileContext";
import type { LockedDocumentMode } from "@app/hooks/tools/shared/useLockedDocuments";

// A locked-document tool must send the locked original and its password, never the unlocked
// re-save, and a wrong password must come back as the server's reason, not a status code.

const post = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));
vi.mock("@app/utils/toolResponseProcessor", () => ({
  processResponse: (blob: Blob, files: { name: string }[]) =>
    Promise.resolve([new File([blob], files[0].name)]),
}));

const { useToolApiCalls } =
  await import("@app/hooks/tools/shared/useToolApiCalls");
const {
  clearLockedDocumentAccess,
  getLockedDocumentAccess,
  isLockedDocumentPasswordRejected,
  setLockedDocumentAccess,
} = await import("@app/services/lockedDocumentAccess");

const file = (content: string, id: string): StirlingFile =>
  Object.assign(new File([content], `${id}.pdf`), {
    fileId: id,
  }) as unknown as StirlingFile;

function run(files: StirlingFile[], lockedDocuments?: LockedDocumentMode) {
  const { processFiles } = renderHook(() => useToolApiCalls<void>()).result
    .current;
  return processFiles(
    undefined,
    files,
    {
      endpoint: "/api/v1/security/cert-sign",
      buildFormData: (_params, input) => {
        const form = new FormData();
        form.append("fileInput", input);
        return form;
      },
      lockedDocuments,
    },
    () => {},
    () => {},
  );
}

const sentForm = (call = 0) => post.mock.calls[call][1] as FormData;

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: new Blob(["ok"]), status: 200, headers: {} });
});
afterEach(() => {
  clearLockedDocumentAccess();
});

describe("processFiles with locked documents", () => {
  it("swaps in the locked original and adds its documentPassword", async () => {
    const original = new File(["encrypted"], "upload.pdf");
    setLockedDocumentAccess("v2", {
      source: original,
      password: "s3cret",
      origin: "unlocked",
    });

    await run([file("re-save", "v2")], "append");

    expect(sentForm().get("fileInput")).toBe(original);
    expect(sentForm().get("documentPassword")).toBe("s3cret");
  });

  it("sends files with no known password unchanged", async () => {
    const plain = file("plain", "p1");

    await run([plain], "audit");

    expect(sentForm().get("fileInput")).toBe(plain);
    expect(sentForm().has("documentPassword")).toBe(false);
  });

  it("leaves tools that did not opt in untouched", async () => {
    const reSave = file("re-save", "v2");
    setLockedDocumentAccess("v2", {
      source: new File(["encrypted"], "upload.pdf"),
      password: "s3cret",
      origin: "unlocked",
    });

    await run([reSave]);

    expect(sentForm().get("fileInput")).toBe(reSave);
    expect(sentForm().has("documentPassword")).toBe(false);
  });

  it("fails with the server's reason from a blob problem-detail body", async () => {
    expectConsole.error("[processFiles] Failed");
    const problem = {
      title: "PDF Password Required",
      detail: "The PDF Document is passworded and the password was incorrect",
    };
    post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 400",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 400,
          // What a blob response looks like to the normaliser (jsdom's Blob has no text()).
          data: { text: async () => JSON.stringify(problem) },
        } as unknown as AxiosResponse,
      ),
    );

    await expect(run([file("locked", "l1")], "append")).rejects.toThrow(
      problem.detail,
    );
  });

  it("drops a typed password the server refused and flags it for the field", async () => {
    expectConsole.error("[processFiles] Failed");
    const locked = file("locked", "l1");
    setLockedDocumentAccess("l1", {
      source: locked,
      password: "wrong",
      origin: "entered",
    });
    post.mockRejectedValue(
      new AxiosError(
        "Request failed",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 400,
          data: {
            text: async () =>
              JSON.stringify({
                type: "/errors/pdf-password",
                title: "PDF Password Required",
              }),
          },
        } as unknown as AxiosResponse,
      ),
    );

    await expect(run([locked], "append")).rejects.toThrow();

    expect(getLockedDocumentAccess("l1")).toBeUndefined();
    expect(isLockedDocumentPasswordRejected("l1")).toBe(true);
  });

  it("keeps the generic message for tools that do not handle locked PDFs", async () => {
    expectConsole.error("[processFiles] Failed");
    post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 400",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 400,
          data: { text: async () => JSON.stringify({ detail: "Bad input" }) },
        } as unknown as AxiosResponse,
      ),
    );

    await expect(run([file("a", "a")])).rejects.toThrow(
      "Failed to process all files: a.pdf",
    );
  });

  it("keeps the generic message when the failures give no shared reason", async () => {
    expectConsole.error("[processFiles] Failed");
    post.mockRejectedValue(new Error("network down"));

    await expect(run([file("a", "a"), file("b", "b")])).rejects.toThrow(
      "Failed to process all files: a.pdf, b.pdf",
    );
  });
});
