import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  uploadHistoryChain,
  uploadHistoryChains,
} from "@app/services/serverStorageUpload";
import { PolicyBlockedError } from "@app/services/policyFileGuard";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  getHistoryChainStubs: vi.fn(),
  getStirlingFile: vi.fn(),
  buildHistoryBundle: vi.fn(),
  buildSharePackage: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/services/fileStorage", () => ({ fileStorage: mocks }));
vi.mock("@app/services/apiClient", () => ({ default: mocks }));
vi.mock("@app/services/serverStorageBundle", () => ({
  buildHistoryBundle: (...args: unknown[]) => mocks.buildHistoryBundle(...args),
  buildSharePackage: (...args: unknown[]) => mocks.buildSharePackage(...args),
}));

const source = createTestStirlingFile("source.pdf");
const leaf = createTestStirlingFile("leaf.pdf");
const chain = [source, leaf].map((file) =>
  createNewStirlingFileStub(file, file.fileId),
);
const bundle = {
  bundleFile: new File(["bundle"], "history.zip"),
  manifest: { entries: chain.map((stub) => ({ logicalId: stub.id })) },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.blocked.clear();
  mocks.getHistoryChainStubs.mockResolvedValue(chain);
  mocks.getStirlingFile.mockResolvedValue(leaf);
  mocks.buildHistoryBundle.mockResolvedValue(bundle);
  mocks.buildSharePackage.mockResolvedValue(bundle);
  mocks.post.mockResolvedValue({ data: { id: 42, updatedAt: 100 } });
  mocks.put.mockResolvedValue({ data: { updatedAt: 200 } });
});

describe.each([
  [
    "single",
    (remoteId?: number) => uploadHistoryChain(source.fileId, remoteId),
  ],
  [
    "bulk",
    (remoteId?: number) => uploadHistoryChains([source.fileId], remoteId),
  ],
] as const)("%s history upload", (_name, upload) => {
  it.each([source, leaf])("rejects a blocked version: $name", async (file) => {
    mocks.blocked.add(file.fileId);
    await expect(upload()).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(mocks.buildHistoryBundle).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rechecks policy failures after preparing the bundle", async () => {
    mocks.buildHistoryBundle.mockImplementationOnce(async () => {
      mocks.blocked.add(leaf.fileId);
      return bundle;
    });
    await expect(upload(42)).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("checks additional versions included by the bundle builder", async () => {
    mocks.blocked.add("new-version");
    mocks.buildHistoryBundle.mockResolvedValue({
      ...bundle,
      manifest: {
        entries: [...bundle.manifest.entries, { logicalId: "new-version" }],
      },
    });
    await expect(upload()).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("allows create and update after the policy recovers", async () => {
    mocks.blocked.add(leaf.fileId);
    await expect(upload()).rejects.toBeInstanceOf(PolicyBlockedError);
    mocks.blocked.clear();
    await expect(upload()).resolves.toMatchObject({
      remoteId: 42,
      updatedAt: 100,
    });
    await expect(upload(42)).resolves.toMatchObject({
      remoteId: 42,
      updatedAt: 200,
    });
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.put).toHaveBeenCalledOnce();
  });
});
