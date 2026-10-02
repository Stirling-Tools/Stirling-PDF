import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import type {
  SignRequestSummary,
  SessionDetail,
  SessionSummary,
} from "@app/types/signingSession";

import { hasUnseenSigningActivity } from "@app/services/signingSeenStore";
import { expectConsole } from "@app/tests/failOnConsole";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  setOverlay: vi.fn(),
  refetch: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "alice" } }),
}));
vi.mock("@app/services/apiClient", () => ({
  default: { get: mocks.get, post: mocks.post },
}));
vi.mock("@app/components/toast", () => ({ alert: mocks.alert }));
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

it("acknowledges an expired invitation even when the empty document error arrives first", async () => {
  expectConsole.error(/Failed to load sign request/);
  let failDetail!: (reason: unknown) => void;
  mocks.get.mockImplementation((url: string) =>
    url.endsWith("/document")
      ? Promise.reject({
          isAxiosError: true,
          response: { status: 403, data: new Blob() },
        })
      : new Promise((_, reject) => {
          failDetail = reject;
        }),
  );
  const { result } = renderHook(() => useSigningSessionController(true));
  let opening!: Promise<void>;
  act(() => {
    opening = result.current.openSignRequest(request);
  });
  await act(async () => {
    failDetail({
      isAxiosError: true,
      response: {
        status: 403,
        data: 'Access denied or sign request not found: 403 FORBIDDEN "Participant access expired"',
      },
    });
    await opening;
  });
  expect(result.current.view).toBe("list");
  expect(result.current.requestData).toBeNull();
  expect(
    hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
  ).toBe(false);
  expect(mocks.alert).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: "signRequest.accessExpired" }),
  );
  expect(mocks.refetch).toHaveBeenCalledOnce();
  expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining("/document"), {
    responseType: "blob",
    suppressErrorToast: true,
  });
});

it.each([
  { isAxiosError: true, response: { status: 500, data: "Server unavailable" } },
  { isAxiosError: true, response: { status: 403, data: "Access denied" } },
  new Error("Network unavailable"),
])(
  "retains unread activity when loading fails without confirmed expiry: %j",
  async (error) => {
    expectConsole.error(/Failed to load sign request/);
    mocks.get.mockRejectedValue(error);
    const { result } = renderHook(() => useSigningSessionController(true));
    await act(async () => {
      await result.current.openSignRequest(request);
    });
    expect(
      hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
    ).toBe(true);
    expect(mocks.alert).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: "signRequest.fetchFailed" }),
    );
  },
);

it("does not acknowledge a late expiry response after leaving the request", async () => {
  let failDetail!: (reason: unknown) => void;
  mocks.get.mockImplementation((url: string) =>
    url.endsWith("/document")
      ? Promise.resolve({ data: new Blob(["pdf"]) })
      : new Promise((_, reject) => {
          failDetail = reject;
        }),
  );
  const { result } = renderHook(() => useSigningSessionController(true));
  let opening!: Promise<void>;
  act(() => {
    opening = result.current.openSignRequest(request);
  });
  act(() => result.current.backToList());
  await act(async () => {
    failDetail({
      isAxiosError: true,
      response: { status: 403, data: "Participant access expired" },
    });
    await opening;
  });
  expect(
    hasUnseenSigningActivity("alice", { ...request, kind: "request" }),
  ).toBe(true);
  expect(mocks.alert).not.toHaveBeenCalled();
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

it("keeps the participant in the preview after signing and refreshes submitted marks", async () => {
  let signed = false;
  const peer = { id: 2, name: "Bob", status: "SIGNED", wetSignatures: [] };
  mocks.post.mockImplementation(async () => {
    signed = true;
  });
  mocks.get.mockImplementation(async (url: string) => ({
    data: url.endsWith("/document")
      ? new Blob(["original"])
      : {
          ...request,
          myStatus: signed ? "SIGNED" : "VIEWED",
          canSign: !signed,
          participants: [peer],
        },
  }));
  const { result } = renderHook(() => useSigningSessionController(true));
  await act(async () => {
    await result.current.openSignRequest(request);
  });
  const original = result.current.requestData!.pdfFile;
  await act(async () => {
    await result.current.requestData!.onSign(new FormData());
  });
  expect(result.current.view).toBe("request");
  expect(result.current.requestData?.canSign).toBe(false);
  expect(result.current.requestData?.signRequest.myStatus).toBe("SIGNED");
  expect(result.current.requestData?.signRequest.participants).toEqual([peer]);
  expect(result.current.requestData?.pdfFile).toBe(original);
});

it("refreshes participant progress without replacing the document or draft, then loads the finalized PDF", async () => {
  let finalized = false;
  let participants: { id: number; name: string; status: string }[] = [];
  mocks.get.mockImplementation(async (url: string) => ({
    data: url.endsWith("/document")
      ? new Blob([finalized ? "final" : "original"])
      : { ...request, finalized, canSign: !finalized, participants },
  }));
  const { result } = renderHook(() => useSigningSessionController(true));
  await act(async () => {
    await result.current.openSignRequest(request);
  });
  const original = result.current.requestData!.pdfFile;
  participants = [{ id: 2, name: "Bob", status: "SIGNED" }];
  mocks.setOverlay.mockClear();
  await act(async () => {
    await result.current.requestData!.onRefresh();
  });
  expect(result.current.requestData?.signRequest.participants).toEqual(
    participants,
  );
  expect(result.current.requestData?.pdfFile).toBe(original);
  expect(mocks.setOverlay).not.toHaveBeenCalled();
  finalized = true;
  await act(async () => {
    await result.current.requestData!.onRefresh();
  });
  expect(result.current.requestData?.canSign).toBe(false);
  expect(result.current.requestData?.signRequest.finalized).toBe(true);
  expect(result.current.requestData?.pdfFile).not.toBe(original);
  expect(result.current.requestData?.pdfFile.size).toBe(5);
});

it("discards a participant refresh that completes after leaving the request", async () => {
  mocks.get.mockImplementation(async (url: string) => ({
    data: url.endsWith("/document")
      ? new Blob(["original"])
      : { ...request, canSign: true },
  }));
  const { result } = renderHook(() => useSigningSessionController(true));
  await act(async () => {
    await result.current.openSignRequest(request);
  });
  let resolve!: (value: unknown) => void;
  mocks.get.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let refresh!: Promise<void>;
  act(() => {
    refresh = result.current.requestData!.onRefresh();
  });
  act(() => result.current.backToList());
  await act(async () => {
    resolve({ data: { ...request, myStatus: "SIGNED" } });
    await refresh;
  });
  expect(result.current.requestData).toBeNull();
  expect(result.current.view).toBe("list");
  expect(mocks.setOverlay).toHaveBeenLastCalledWith(null);
});
