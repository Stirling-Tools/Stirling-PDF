import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import apiClient from "@editor/services/apiClient";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  ensureLocalPdfAccess,
  rememberPdfAccess,
  setSignedPdfEditPolicy,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import { signedPdfEditsBlockedMessage } from "@editor/services/pdfSessionUnlock";
import { ChatProvider, useChat } from "@editor/components/chat/ChatContext";

const consumeFiles = vi.fn();
let chatMessages: string[] = [];
const signedAccess: PdfAccess = {
  password: "",
  encrypted: false,
  signed: true,
  ownerAuthenticated: false,
  permissions: -1,
  pageCount: 1,
};
const signed = createStirlingFile(
  new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" }),
);

vi.mock("@editor/contexts/FileContext", () => ({
  useAllFiles: () => ({
    files: [signed],
    fileStubs: [{ id: signed.fileId, name: signed.name }],
  }),
  useFileActions: () => ({ actions: { consumeFiles, addFiles: vi.fn() } }),
}));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: vi.fn(),
}));
vi.mock("@editor/services/apiClient", () => ({ default: { get: vi.fn() } }));
vi.mock("@editor/contexts/file/fileActions", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/contexts/file/fileActions")
  >()),
  generateProcessedFileMetadata: async () => undefined,
}));
vi.mock("@editor/services/aiBaseUrl", () => ({
  getAiBaseUrl: async () => "http://ai.test",
}));
vi.mock("@editor/services/apiClientSetup", () => ({
  getAuthHeaders: async () => ({}),
}));

function stream(...frames: Array<[string, unknown]>): Response {
  const body = frames
    .map(([event, data]) => `event:${event}\ndata:${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(new TextEncoder().encode(body));
}

const rotate = {
  phase: "executing_tool",
  timestamp: 1,
  tool: "/api/v1/general/rotate-pdf",
  stepIndex: 1,
  stepCount: 1,
};
const rotated = {
  outcome: "completed",
  summary: "Rotated.",
  resultFiles: [
    {
      fileId: "out-1",
      fileName: "contract.pdf",
      contentType: "application/pdf",
      sourceIndex: 0,
    },
  ],
};

async function send(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  const { result } = renderHook(() => useChat(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ChatProvider>{children}</ChatProvider>
    ),
  });
  await act(() => result.current.sendMessage("rotate it"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  chatMessages = result.current.messages.map((m) => m.content);
  return result.current.messages.at(-1)?.content;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPdfAccess();
  setSignedPdfEditPolicy(true);
  rememberPdfAccess(signed, signedAccess);
});
afterEach(() => {
  setSignedPdfEditPolicy(false);
  vi.unstubAllGlobals();
});

describe("AI chat on a signed PDF while changes are blocked", () => {
  it("stops at the first step that would rewrite it and imports nothing", async () => {
    await expect(
      send(stream(["progress", rotate], ["result", rotated])),
    ).resolves.toBe(signedPdfEditsBlockedMessage());
    expect(
      chatMessages.filter((m) => m === signedPdfEditsBlockedMessage()),
    ).toHaveLength(1);
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(consumeFiles).not.toHaveBeenCalled();
  });

  it("reads a file nobody has opened before importing what the chat produced", async () => {
    clearPdfAccess();
    vi.mocked(ensureLocalPdfAccess).mockResolvedValue(signedAccess);
    await expect(
      send(stream(["progress", rotate], ["result", rotated])),
    ).resolves.toBe(signedPdfEditsBlockedMessage());
    expect(ensureLocalPdfAccess).toHaveBeenCalledWith(signed, undefined);
    expect(consumeFiles).not.toHaveBeenCalled();
  });

  it("still answers questions that change nothing", async () => {
    await expect(
      send(
        stream([
          "result",
          { outcome: "answer", answer: "It has five clauses." },
        ]),
      ),
    ).resolves.toContain("five clauses");
  });

  it("imports results normally while the setting is off", async () => {
    setSignedPdfEditPolicy(false);
    vi.mocked(apiClient.get).mockResolvedValue({
      data: new Blob(["%PDF-1.7 rotated"], { type: "application/pdf" }),
    });
    await send(stream(["progress", rotate], ["result", rotated]));
    await waitFor(() => expect(consumeFiles).toHaveBeenCalledOnce());
  });
});
