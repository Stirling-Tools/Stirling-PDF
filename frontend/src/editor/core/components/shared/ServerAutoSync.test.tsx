import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { AxiosError } from "axios";

const mocks = vi.hoisted(() => ({
  files: { ids: [] as string[], byId: {} },
  autoSync: true,
  uploadHistoryChain: vi.fn(),
  recordChainUpload: vi.fn(),
  updateStirlingFileStub: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("@editor/contexts/FileContext", () => ({
  useFileSelector: (select: (state: unknown) => unknown) =>
    select({ files: mocks.files }),
  useFileActions: () => ({
    actions: { updateStirlingFileStub: mocks.updateStirlingFileStub },
  }),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: true } }),
}));
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { autoSyncServerFiles: mocks.autoSync },
  }),
}));
vi.mock("@editor/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@editor/services/serverStorageUpload", () => ({
  uploadHistoryChain: mocks.uploadHistoryChain,
  recordChainUpload: mocks.recordChainUpload,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

import { ServerAutoSync } from "@editor/components/shared/ServerAutoSync";

function version(
  id: string,
  revision: string,
  syncedLeafId: string,
  isLeaf = true,
) {
  return {
    id,
    originalFileId: "doc",
    name: "contract.pdf",
    isLeaf,
    remoteStorageId: 7,
    remoteOwnedByCurrentUser: true,
    remoteSync: { revision, leafId: syncedLeafId },
  };
}

function open(...stubs: Array<{ id: string }>) {
  mocks.files = {
    ids: stubs.map((stub) => stub.id),
    byId: Object.fromEntries(stubs.map((stub) => [stub.id, stub])),
  };
}

function staleBase(): AxiosError {
  const error = new AxiosError("Conflict");
  error.response = { status: 409 } as AxiosError["response"];
  return error;
}

async function settle(ms = 2000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

describe("ServerAutoSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.autoSync = true;
    open();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes an edited version against its base revision once edits settle", async () => {
    open(version("v1", "r1", "v1", false), version("v2", "r1", "v1"));
    const result = { remoteId: 7, updatedAt: 1, chain: [], remoteSync: {} };
    mocks.uploadHistoryChain.mockResolvedValue(result);

    render(<ServerAutoSync />);
    await settle(1999);
    expect(mocks.uploadHistoryChain).not.toHaveBeenCalled();
    await settle(1);

    expect(mocks.uploadHistoryChain).toHaveBeenCalledWith("doc", 7, {
      expectedRevision: "r1",
      quiet: true,
    });
    expect(mocks.recordChainUpload).toHaveBeenCalledWith(
      result,
      expect.arrayContaining([
        expect.objectContaining({ id: "v1" }),
        expect.objectContaining({ id: "v2" }),
      ]),
      mocks.updateStirlingFileStub,
    );
  });

  it("gives a version made during the upload the new base", async () => {
    open(version("v1", "r1", "v1", false), version("v2", "r1", "v1"));
    let finish: (value: unknown) => void = () => {};
    mocks.uploadHistoryChain.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );

    const { rerender } = render(<ServerAutoSync />);
    await settle();
    open(
      version("v1", "r1", "v1", false),
      version("v2", "r1", "v1", false),
      version("v3", "r1", "v1"),
    );
    rerender(<ServerAutoSync />);
    await act(async () => finish({ remoteId: 7, updatedAt: 1, chain: [] }));

    const recorded = mocks.recordChainUpload.mock.calls[0][1] as Array<{
      id: string;
    }>;
    expect(recorded.map((stub) => stub.id)).toContain("v3");
  });

  it("leaves unchanged files and disabled sync alone", async () => {
    open(version("v1", "r1", "v1"));
    const { rerender } = render(<ServerAutoSync />);
    await settle();

    mocks.autoSync = false;
    open(version("v1", "r1", "v1", false), version("v2", "r1", "v1"));
    rerender(<ServerAutoSync />);
    await settle();

    expect(mocks.uploadHistoryChain).not.toHaveBeenCalled();
  });

  it("reports a refused push once and waits for a new base before retrying", async () => {
    mocks.uploadHistoryChain.mockRejectedValue(staleBase());
    open(version("v1", "r1", "v1", false), version("v2", "r1", "v1"));
    const { rerender } = render(<ServerAutoSync />);
    await settle();
    expect(mocks.alert).toHaveBeenCalledTimes(1);

    open(version("v2", "r1", "v1", false), version("v3", "r1", "v1"));
    rerender(<ServerAutoSync />);
    await settle();
    expect(mocks.uploadHistoryChain).toHaveBeenCalledTimes(1);

    open(version("v3", "r2", "v2"));
    rerender(<ServerAutoSync />);
    await settle();
    expect(mocks.uploadHistoryChain).toHaveBeenCalledTimes(2);
    expect(mocks.uploadHistoryChain).toHaveBeenLastCalledWith("doc", 7, {
      expectedRevision: "r2",
      quiet: true,
    });
  });
});
