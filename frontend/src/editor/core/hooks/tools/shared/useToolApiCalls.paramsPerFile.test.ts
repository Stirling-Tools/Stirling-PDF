import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { rememberUnprotectedPdf } from "@editor/tests/utils/testFileHelpers";
import type { StirlingFile } from "@editor/types/fileContext";
import { clearPdfAccess } from "@editor/services/pdfAccessService";

// A tool whose request for one file depends on the files before it (Bates numbers
// carry on across a batch) gets its own parameters for each file, in order.

const post = vi.fn();
vi.mock("@editor/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));
vi.mock("@editor/utils/toolResponseProcessor", () => ({
  processResponse: (blob: Blob, files: { name: string }[]) =>
    Promise.resolve([new File([blob], `out-${files[0].name}`)]),
}));

const { useToolApiCalls } =
  await import("@editor/hooks/tools/shared/useToolApiCalls");

const file = (name: string): StirlingFile =>
  Object.assign(
    rememberUnprotectedPdf(
      new File(["test"], name, { type: "application/pdf" }),
    ),
    { fileId: name },
  ) as StirlingFile;

function run(
  files: StirlingFile[],
  paramsPerFile?: (start: number, files: File[]) => Promise<number[]>,
) {
  const buildFormData = vi.fn((start: number, input: File) => {
    const form = new FormData();
    form.set("name", input.name);
    form.set("start", String(start));
    return form;
  });
  const { processFiles } = renderHook(() => useToolApiCalls<number>()).result
    .current;
  return {
    buildFormData,
    result: processFiles(
      1,
      files,
      {
        endpoint: "/api/v1/misc/add-page-numbers",
        buildFormData,
        paramsPerFile,
      },
      () => {},
      () => {},
    ),
  };
}

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: new Blob(["output"]), status: 200 });
  clearPdfAccess();
});

describe("processFiles per-file parameters", () => {
  it("builds each request from that file's parameters", async () => {
    const inputs = [file("a.pdf"), file("b.pdf"), file("c.pdf")];
    const { buildFormData, result } = run(inputs, async (start, files) =>
      files.map((_, index) => start + index * 10),
    );
    await result;

    expect(buildFormData.mock.calls.map(([start]) => start)).toEqual([
      1, 11, 21,
    ]);
  });

  it("gives every file the same parameters without the hook", async () => {
    const { buildFormData, result } = run([file("a.pdf"), file("b.pdf")]);
    await result;

    expect(buildFormData.mock.calls.map(([start]) => start)).toEqual([1, 1]);
  });
});
