import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeFiles, createChildStub } from "@app/contexts/file/fileActions";
import {
  getLastViewedPage,
  setLastViewedPage,
} from "@app/services/lastViewedPageStore";
import {
  createNewStirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";
import type { FileId, ToolOperation } from "@app/types/file";

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { persistVersionedOutputs: vi.fn() },
}));

const OPERATION: ToolOperation = { toolId: "compress", timestamp: 0 };

function pdf(name: string, lastModified: number) {
  return createStirlingFile(
    new File(["%PDF-1.7"], name, { type: "application/pdf", lastModified }),
  );
}

beforeEach(() => localStorage.clear());

describe("consumeFiles", () => {
  it("hands the input's last viewed page to the version that replaces it", async () => {
    const input = pdf("report.pdf", 1);
    const inputStub = createNewStirlingFileStub(input, input.fileId);
    const output = pdf("report.pdf", 2);
    const outputStub = createChildStub(inputStub, OPERATION, output);
    const filesRef = {
      current: new Map<FileId, File>([[input.fileId, input]]),
    };
    setLastViewedPage(input.quickKey, 8);

    await consumeFiles(
      [input.fileId],
      [createStirlingFile(output, outputStub.id)],
      [outputStub],
      filesRef,
      vi.fn(),
    );

    expect(getLastViewedPage(input.quickKey)).toBeNull();
    expect(getLastViewedPage(output.quickKey)).toBe(8);
  });
});
