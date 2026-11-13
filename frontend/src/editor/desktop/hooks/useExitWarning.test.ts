import { expect, it } from "vitest";
import { filesToSaveOnQuit } from "@editor/hooks/useExitWarning";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const stub = (id: string, extra: Partial<StirlingFileStub> = {}) =>
  ({ id: id as FileId, name: `${id}.pdf`, ...extra }) as StirlingFileStub;
const diskUnsaved = (s: StirlingFileStub) =>
  Boolean(s.isDirty && s.localFilePath);

it("offers edits whose disk original was deleted", () => {
  const orphan = stub("orphan", {
    isDirty: true,
    orphanedFilePath: "C:/docs/gone.pdf",
  });
  expect(filesToSaveOnQuit([orphan], diskUnsaved)).toEqual([orphan]);
});

it("offers files a save target has not received yet", () => {
  const cloud = stub("cloud");
  expect(filesToSaveOnQuit([cloud], (s) => s.id === cloud.id)).toEqual([cloud]);
});

it("skips files with nothing unsaved", () => {
  const clean = stub("clean", { localFilePath: "C:/docs/clean.pdf" });
  expect(filesToSaveOnQuit([clean], diskUnsaved)).toEqual([]);
});
