import { describe, expect, test } from "vitest";
import { countUnreducedOutputs } from "@editor/hooks/tools/compress/useUnreducedOutputs";
import type { FileId, StirlingFileStub } from "@editor/types/fileContext";

const id = (value: string) => value as FileId;

const output = (parentFileId: string, size: number): StirlingFileStub =>
  ({
    id: id(`out-${parentFileId}`),
    parentFileId: id(parentFileId),
    size,
  }) as StirlingFileStub;

describe("countUnreducedOutputs", () => {
  const inputSizes = new Map([
    [id("a"), 1000],
    [id("b"), 2000],
  ]);

  test("an output smaller than its input is reduced", () => {
    expect(countUnreducedOutputs(inputSizes, [output("a", 600)])).toEqual({
      unreduced: 0,
      total: 1,
    });
  });

  test("an output the same size or larger than its input is unreduced", () => {
    expect(
      countUnreducedOutputs(inputSizes, [output("a", 1000), output("b", 2500)]),
    ).toEqual({ unreduced: 2, total: 2 });
  });

  test("pairs each output with its own input, not the others", () => {
    expect(
      countUnreducedOutputs(inputSizes, [output("a", 1500), output("b", 1500)]),
    ).toEqual({ unreduced: 1, total: 2 });
  });

  test("outputs with no recorded input are not counted", () => {
    expect(
      countUnreducedOutputs(inputSizes, [output("c", 5000), undefined]),
    ).toEqual({ unreduced: 0, total: 0 });
  });
});
