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
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { getLeafStirlingFileStubs: async () => h.stubs },
}));
vi.mock("@editor/services/workbenchSession", () => ({
  readWorkbenchSession: () => ({ fileIds: h.open, selectedFileIds: [] }),
  originalIdOf: (stub: StoredStub) => stub.originalFileId || stub.id,
}));

import { unsavedWorkbenchFiles } from "@editor/components/ProcessorPageHandlers";

beforeEach(() => {
  h.open = ["a", "b", "c"];
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

  const unsaved = await unsavedWorkbenchFiles();

  expect(unsaved.map((stub) => stub.name)).toEqual([
    "disk.pdf",
    "onedrive.pdf",
  ]);
});

it("finds nothing when no files are open", async () => {
  h.open = [];
  h.stubs = [{ id: "a", name: "disk.pdf", isDirty: true }];

  expect(await unsavedWorkbenchFiles()).toEqual([]);
});
