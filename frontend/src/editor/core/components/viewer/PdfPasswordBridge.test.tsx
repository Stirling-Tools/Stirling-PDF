import { act, render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfPasswordBridge } from "@editor/components/viewer/PdfPasswordBridge";
import { PdfErrorCode } from "@embedpdf/models";
import type { FileId } from "@editor/types/file";

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
vi.mock("@editor/contexts/FileContext", () => ({
  useFileActions: () => ({
    actions: { openEncryptedUnlockPrompt: mock.prompt },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.document = { id: "native-doc", status: "error", errorCode: 4 };
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

it.each(["switch", "unmount"])(
  "ignores a retry failure after %s",
  async (change) => {
    let reject!: (error: Error) => void;
    const retry = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    mock.loaded.mockReturnValueOnce(retry);
    const view = render(
      <PdfPasswordBridge fileId="old-file" password="password" />,
    );
    await waitFor(() => expect(mock.loaded).toHaveBeenCalledOnce());
    if (change === "switch") {
      mock.document = { id: "other-doc", status: "loaded", errorCode: 0 };
      view.rerender(<PdfPasswordBridge fileId="other-file" />);
    } else view.unmount();
    await act(async () => reject(new Error("late password failure")));
    expect(mock.prompt).not.toHaveBeenCalled();
  },
);

it("requests the preview unlock prompt without a library file ID", () => {
  const prompt = vi.fn();
  const view = render(<PdfPasswordBridge onPasswordRequired={prompt} />);
  expect(prompt).toHaveBeenCalledOnce();
  view.rerender(<PdfPasswordBridge onPasswordRequired={prompt} />);
  expect(prompt).toHaveBeenCalledOnce();
  expect(mock.prompt).not.toHaveBeenCalled();
});

it("returns a rejected preview credential to the preview prompt", async () => {
  const prompt = vi.fn();
  mock.loaded.mockRejectedValueOnce(new Error("password rejected"));
  render(<PdfPasswordBridge password="stale" onPasswordRequired={prompt} />);
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  expect(mock.prompt).not.toHaveBeenCalled();
});
