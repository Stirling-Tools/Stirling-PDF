import { act, renderHook } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    selectors: {
      getStirlingFileStub: () => undefined,
      getFile: () => undefined,
    },
  }),
}));
vi.mock("@app/hooks/tools/validateSignature/signatureReportPdf", () => ({
  createReportPdf: vi.fn(
    async () => new File(["%PDF"], "report.pdf", { type: "application/pdf" }),
  ),
}));
const t = (_key: string, fallback?: unknown) =>
  typeof fallback === "string" ? fallback : _key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
}));

import apiClient from "@app/services/apiClient";
import { useValidateSignatureOperation } from "@app/hooks/tools/validateSignature/useValidateSignatureOperation";
import { createStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import {
  clearLockedDocumentAccess,
  retainLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";

const ENDPOINT = "/api/v1/security/validate-signature";

function pdf(content: string, name = "aadhaar.pdf"): File {
  return new File([content], name, { type: "application/pdf" });
}

// jsdom's File has no text(), so read the sent bytes back the old way.
function sentText(body: FormData): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(body.get("fileInput") as File);
  });
}

async function validate(file: File, id: string): Promise<FormData> {
  const { result } = renderHook(() => useValidateSignatureOperation());
  await act(async () => {
    await result.current.executeOperation({ certFile: null }, [
      createStirlingFile(file, id as FileId),
    ]);
  });
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  const [url, body] = (apiClient.post as Mock).mock.calls[0];
  expect(url).toBe(ENDPOINT);
  return body as FormData;
}

describe("useValidateSignatureOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.post as Mock).mockResolvedValue({ data: [] });
  });
  afterEach(() => {
    clearLockedDocumentAccess();
  });

  it("sends the file as-is with no password for a plain upload", async () => {
    const body = await validate(pdf("%PDF-1.7 signed"), "plain-id");

    expect(await sentText(body)).toBe("%PDF-1.7 signed");
    expect(body.has("documentPassword")).toBe(false);
  });

  it("sends the encrypted original and its password for a file unlocked in-app", async () => {
    setLockedDocumentAccess("unlocked-id", {
      source: pdf("%PDF-1.7 encrypted original"),
      password: "s3cret",
      origin: "unlocked",
    });

    const body = await validate(pdf("%PDF-1.7 re-save"), "unlocked-id");

    expect(await sentText(body)).toBe("%PDF-1.7 encrypted original");
    expect(body.get("documentPassword")).toBe("s3cret");
  });

  it("validates the current bytes once the unlocked version has left the workbench", async () => {
    setLockedDocumentAccess("unlocked-id", {
      source: pdf("original"),
      password: "s3cret",
      origin: "unlocked",
    });
    retainLockedDocumentAccess(["edited-id"]);

    const body = await validate(pdf("edited"), "unlocked-id");

    expect(await sentText(body)).toBe("edited");
    expect(body.has("documentPassword")).toBe(false);
  });

  it("sends the password typed for a file the user kept locked", async () => {
    const locked = pdf("%PDF-1.7 locked");
    setLockedDocumentAccess("locked-id", {
      source: locked,
      password: "typed",
      origin: "entered",
    });

    const body = await validate(locked, "locked-id");

    expect(await sentText(body)).toBe("%PDF-1.7 locked");
    expect(body.get("documentPassword")).toBe("typed");
  });

  it("reports the server's reason when the password is wrong", async () => {
    (apiClient.post as Mock).mockRejectedValue(
      new AxiosError(
        "Request failed with status code 400",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 400,
          data: {
            title: "PDF Password Required",
            detail: "Wrong PDF password",
          },
        } as AxiosResponse,
      ),
    );
    const { result } = renderHook(() => useValidateSignatureOperation());

    await act(async () => {
      await result.current.executeOperation({ certFile: null }, [
        createStirlingFile(pdf("%PDF"), "locked-id" as FileId),
      ]);
    });

    expect(result.current.results[0]?.error).toBe("Wrong PDF password");
  });
});
