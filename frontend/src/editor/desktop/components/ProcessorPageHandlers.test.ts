import { beforeEach, expect, it, vi } from "vitest";
import type { StirlingFileStub } from "@editor/types/fileContext";

/** Test records; ids are plain strings here. */
type StoredStub = Omit<Partial<StirlingFileStub>, "id" | "originalFileId"> & {
  id: string;
  originalFileId?: string;
};

const h = vi.hoisted(() => ({
  stubs: [] as StoredStub[],
  open: ["a", "b", "c"],
  owner: "fp:alice" as string | null,
  storageFails: false,
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: {
    getLeafStirlingFileStubs: async () => {
      if (h.storageFails) throw new Error("IndexedDB unavailable");
      return h.stubs;
    },
  },
}));
vi.mock("@editor/services/workbenchSession", () => ({
  readWorkbenchSession: () => ({
    fileIds: h.open,
    selectedFileIds: [],
    userId: h.owner,
  }),
  originalIdOf: (stub: StoredStub) => stub.originalFileId || stub.id,
  fingerprintOwner: async (userId: string) => `fp:${userId}`,
}));

import { unsavedWorkbenchFiles } from "@editor/components/ProcessorPageHandlers";

beforeEach(() => {
  h.open = ["a", "b", "c"];
  h.owner = "fp:alice";
  h.storageFails = false;
  h.stubs = [];
});

it("counts open files unsaved to disk or to the cloud drive they came from", async () => {
  h.stubs = [
    { id: "a", name: "disk.pdf", isDirty: true },
    { id: "b", name: "saved.pdf", isDirty: false },
    {
      id: "c2",
      originalFileId: "c",
      name: "onedrive.pdf",
      cloudOrigin: { savedFileId: "c1" } as StirlingFileStub["cloudOrigin"],
    },
    { id: "d", name: "closed.pdf", isDirty: true },
  ];

  const unsaved = await unsavedWorkbenchFiles("alice");

  expect(unsaved?.map((stub) => stub.name)).toEqual([
    "disk.pdf",
    "onedrive.pdf",
  ]);
});

it("finds nothing when no files are open", async () => {
  h.open = [];
  h.stubs = [{ id: "a", name: "disk.pdf", isDirty: true }];

  expect(await unsavedWorkbenchFiles("alice")).toEqual([]);
});

it("ignores a workbench another account left behind", async () => {
  h.stubs = [{ id: "a", name: "theirs.pdf", isDirty: true }];

  expect(await unsavedWorkbenchFiles("bob")).toEqual([]);
});

it("reports a storage failure rather than passing it off as nothing unsaved", async () => {
  h.storageFails = true;

  expect(await unsavedWorkbenchFiles("alice")).toBeNull();
});
