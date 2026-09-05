import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { expectConsole } from "@app/tests/failOnConsole";
import type { StirlingFile } from "@app/types/fileContext";

// One bad file in a batch must come back named, with its error: the caller reports each one,
// and it cannot derive the failure kind without the error the request threw.

const post = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

// Mirrors the response body, so a 0-byte answer really does produce an empty output.
vi.mock("@app/utils/toolResponseProcessor", () => ({
  processResponse: (blob: Blob, files: { name: string }[]) =>
    Promise.resolve([new File([blob], `out-${files[0].name}`)]),
}));

const { useToolApiCalls } =
  await import("@app/hooks/tools/shared/useToolApiCalls");

const file = (name: string, id: string): StirlingFile =>
  ({ name, fileId: id, size: 10 }) as unknown as StirlingFile;

function run(files: StirlingFile[]) {
  const { processFiles } = renderHook(() => useToolApiCalls()).result.current;
  return processFiles(
    undefined,
    files,
    {
      endpoint: "/api/v1/misc/compress-pdf",
      buildFormData: () => new FormData(),
    },
    () => {},
    () => {},
  );
}

beforeEach(() => {
  post.mockReset();
});

describe("processFiles failure reporting", () => {
  it("names the failed input and keeps its error while the rest succeed", async () => {
    expectConsole.error("[processFiles] Failed");
    const boom = new Error("corrupted");
    let call = 0;
    post.mockImplementation(() => {
      call += 1;
      return call === 2
        ? Promise.reject(boom)
        : Promise.resolve({ data: new Blob(["ok"]), status: 200, headers: {} });
    });

    const result = await run([
      file("a.pdf", "f-a"),
      file("bad.pdf", "f-bad"),
      file("c.pdf", "f-c"),
    ]);

    expect(result.outputFiles).toHaveLength(2);
    expect(result.successSourceIds).toEqual(["f-a", "f-c"]);
    expect(result.failedInputs).toEqual([
      { fileId: "f-bad", name: "bad.pdf", error: boom },
    ]);
  });

  it("reports nothing when every input succeeded", async () => {
    post.mockResolvedValue({
      data: new Blob(["ok"]),
      status: 200,
      headers: {},
    });

    const result = await run([file("a.pdf", "f-a")]);

    expect(result.failedInputs).toEqual([]);
  });

  it("treats an empty output as a failure the caller must hear about", async () => {
    // A 200 with a 0-byte body is a failure the old code counted only in a status string.
    expectConsole.warn("[processFiles] Empty output treated as failure");
    let call = 0;
    post.mockImplementation(() => {
      call += 1;
      return Promise.resolve({
        data: new Blob(call === 1 ? ["ok"] : []),
        status: 200,
        headers: {},
      });
    });

    const result = await run([file("a.pdf", "f-a"), file("empty.pdf", "f-e")]);

    expect(result.successSourceIds).toEqual(["f-a"]);
    expect(result.failedInputs.map((f) => f.fileId)).toEqual(["f-e"]);
  });
});
