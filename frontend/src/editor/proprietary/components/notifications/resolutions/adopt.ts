import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import type { FileId } from "@app/types/file";
import type {
  FileContextActions,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { ToolId } from "@app/types/toolId";

// Both mark the result `derivedFromTool`, which keeps `usePolicyAutoRun` off it.

/** Adds a produced document on its own, selected so it is on screen. */
export async function addToWorkbench(
  actions: FileContextActions,
  file: File,
): Promise<FileId[]> {
  const added = await actions.addFiles([file], {
    selectFiles: true,
    derivedFromTool: true,
  });
  return added.map((added) => added.fileId);
}

/** Versions `parentStub` in place with `file`, attributed to `toolId` in its history. */
export async function versionUnder(
  actions: FileContextActions,
  parentStub: StirlingFileStub,
  file: File,
  toolId: ToolId,
): Promise<FileId[]> {
  const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
    [file],
    parentStub,
    toolId,
  );
  const outputIds = await actions.consumeFiles(
    [parentStub.id],
    stirlingFiles,
    stubs.map((stub) => ({ ...stub, derivedFromTool: true })),
  );
  actions.setSelectedFiles(outputIds);
  return outputIds;
}
