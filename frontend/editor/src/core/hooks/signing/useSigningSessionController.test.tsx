import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import type { SignRequestSummary } from "@app/types/signingSession";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setOverlay: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@app/services/apiClient", () => ({ default: { get: mocks.get } }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/services/fileStorage", () => ({ fileStorage: {} }));
vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: {} }),
}));
vi.mock("@app/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => [],
}));
vi.mock("@app/contexts/SigningOverlayContext", () => ({
  useSigningOverlay: () => ({ setOverlay: mocks.setOverlay }),
}));
vi.mock("@app/hooks/signing/useSigningSessions", () => ({
  useSigningSessions: () => ({
    signRequests: [],
    mySessions: [],
    loading: false,
    refetch: mocks.refetch,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const request: SignRequestSummary = {
  sessionId: "one",
  documentName: "Test.pdf",
  ownerUsername: "Alice",
  createdAt: "2026-09-24",
  dueDate: "",
  myStatus: "PENDING",
};

beforeEach(() => vi.clearAllMocks());

it("does not reopen a request after the user returns to the session list", async () => {
  let complete!: (value: { data: Blob }) => void;
  mocks.get.mockImplementation((url: string) =>
    url.endsWith("/document")
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve({ data: { ...request, canSign: true } }),
  );
  const { result } = renderHook(() => useSigningSessionController(true));
  let opening!: Promise<void>;
  act(() => {
    opening = result.current.openSignRequest(request);
  });
  act(() => result.current.backToList());
  await act(async () => {
    complete({ data: new Blob(["pdf"]) });
    await opening;
  });
  expect(result.current.view).toBe("list");
  expect(result.current.requestData).toBeNull();
  expect(mocks.setOverlay).toHaveBeenLastCalledWith(null);
});

it("releases pending document loads when the workspace unmounts", async () => {
  let complete!: (value: { data: Blob }) => void;
  mocks.get.mockImplementation((url: string) =>
    url.endsWith("/document")
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve({ data: { ...request, canSign: true } }),
  );
  const { result, unmount } = renderHook(() =>
    useSigningSessionController(true),
  );
  const opening = result.current.openSignRequest(request);
  unmount();
  await act(async () => {
    complete({ data: new Blob(["pdf"]) });
    await opening;
  });
  expect(mocks.setOverlay).toHaveBeenCalledTimes(1);
  expect(mocks.setOverlay).toHaveBeenLastCalledWith(null);
});
