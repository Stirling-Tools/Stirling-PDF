import { describe, expect, test } from "vitest";
import {
  buildChunkDocumentFormData,
  chunksFromResponse,
  chunksToJsonl,
} from "@app/hooks/tools/chunkDocument/chunkDocumentOperationConfig";
import { defaultParameters } from "@app/hooks/tools/chunkDocument/useChunkDocumentParameters";

describe("chunkDocument operation helpers", () => {
  test("accepts both bare-array and wrapped chunk responses", () => {
    const chunks = [{ text: "a" }, { text: "b" }];
    expect(chunksFromResponse(chunks)).toEqual(chunks);
    expect(chunksFromResponse({ chunks })).toEqual(chunks);
    expect(chunksFromResponse({ nope: true })).toEqual([]);
    expect(chunksFromResponse(null)).toEqual([]);
  });

  test("emits one JSON document per JSONL line", () => {
    const jsonl = chunksToJsonl([
      { text: "a", page: 1 },
      { text: "b", page: 2 },
    ]);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { text: "a", page: 1 },
      { text: "b", page: 2 },
    ]);
  });

  test("builds the multipart form the backend contract expects", () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    const form = buildChunkDocumentFormData(
      { ...defaultParameters, chunkSize: 800, overlap: 50, mode: "advanced" },
      file,
    );
    expect(form.get("fileInput")).toBe(file);
    expect(form.get("chunkSize")).toBe("800");
    expect(form.get("overlap")).toBe("50");
    expect(form.get("mode")).toBe("advanced");
  });
});
