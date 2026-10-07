import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfPasswordBridge } from "@app/components/viewer/PdfPasswordBridge";
import { PdfErrorCode } from "@embedpdf/models";
import type { FileId } from "@app/types/file";

const mock = vi.hoisted(() => ({
  retry: vi.fn(),
  prompt: vi.fn(),
  document: { id: "native-doc", status: "error", errorCode: 4 },
  loaded: vi.fn(),
}));
vi.mock("@embedpdf/plugin-document-manager/react", () => ({
  useActiveDocument: () => ({ activeDocument: mock.document }),
  useDocumentManagerCapability: () => ({
    provides: { retryDocument: mock.retry },
  }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({
    actions: { openEncryptedUnlockPrompt: mock.prompt },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.document.errorCode = PdfErrorCode.Password;
  mock.loaded.mockResolvedValue(undefined);
  mock.retry.mockReturnValue({
    toPromise: async () => ({ task: { toPromise: mock.loaded } }),
  });
});
afterEach(cleanup);

it("prompts once for a native password failure then retries the same document with the session credential", async () => {
  const fileId = "file" as FileId;
  const view = render(<PdfPasswordBridge fileId={fileId} />);
  expect(mock.prompt).toHaveBeenCalledExactlyOnceWith(fileId);
  view.rerender(
    <PdfPasswordBridge fileId={fileId} password=" exact password " />,
  );
  await waitFor(() => expect(mock.loaded).toHaveBeenCalledOnce());
  expect(mock.retry).toHaveBeenCalledExactlyOnceWith("native-doc", {
    password: " exact password ",
  });
  view.rerender(
    <PdfPasswordBridge fileId={fileId} password=" exact password " />,
  );
  expect(mock.retry).toHaveBeenCalledOnce();
});

it("does not mistake a corrupt document for a password failure", () => {
  mock.document.errorCode = 99;
  render(<PdfPasswordBridge fileId="file" password="password" />);
  expect(mock.retry).not.toHaveBeenCalled();
  expect(mock.prompt).not.toHaveBeenCalled();
});

it("keeps a rejected native retry in the unlock flow", async () => {
  mock.loaded.mockRejectedValueOnce(new Error("password rejected"));
  render(<PdfPasswordBridge fileId="file" password="password" />);
  await waitFor(() => expect(mock.prompt).toHaveBeenCalledWith("file"));
});
