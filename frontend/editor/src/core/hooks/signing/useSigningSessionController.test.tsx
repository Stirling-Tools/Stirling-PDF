import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import type {
  SignRequestSummary,
  SessionDetail,
  SessionSummary,
} from "@app/types/signingSession";

import { hasUnseenSigningActivity } from "@app/services/signingSeenStore";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setOverlay: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "alice" } }),
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

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
  expect(
    hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
  ).toBe(true);
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

it("acknowledges a request only after its detail and PDF have opened", async () => {
  mocks.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.endsWith("/document")
        ? new Blob(["pdf"])
        : { ...request, canSign: true },
    }),
  );
  const { result } = renderHook(() => useSigningSessionController(true));
  expect(
    hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
  ).toBe(true);
  await act(async () => {
    await result.current.openSignRequest(request);
  });
  expect(result.current.view).toBe("request");
  expect(
    hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
  ).toBe(false);
});

it("does not acknowledge participant updates from a refresh after leaving the session", async () => {
  const detail: SessionDetail = {
    sessionId: "owner",
    documentName: "Test.pdf",
    ownerEmail: "alice@example.test",
    message: "",
    dueDate: "",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    finalized: false,
    participants: [
      {
        id: 1,
        userId: 2,
        email: "bob@example.test",
        name: "Bob",
        status: "PENDING",
        lastUpdated: "2026-10-01",
      },
    ],
  };
  const summary: SessionSummary = {
    ...detail,
    participantCount: 1,
    signedCount: 0,
  };
  mocks.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.endsWith("/pdf") ? new Blob(["pdf"]) : detail,
    }),
  );
  const { result } = renderHook(() => useSigningSessionController(true));
  await act(async () => {
    await result.current.openSession(summary);
  });
  let finish!: (value: { data: SessionDetail }) => void;
  mocks.get.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let refreshing!: Promise<void>;
  act(() => {
    refreshing = result.current.detailData!.onRefresh();
  });
  act(() => result.current.backToList());
  const changed: SessionDetail = {
    ...detail,
    participants: [
      {
        ...detail.participants[0],
        status: "DECLINED",
        lastUpdated: "2026-10-02",
      },
    ],
  };
  await act(async () => {
    finish({ data: changed });
    await refreshing;
  });
  expect(result.current.view).toBe("list");
  expect(
    hasUnseenSigningActivity("alice", {
      ...summary,
      participants: changed.participants,
      kind: "session",
    }),
  ).toBe(true);
});
