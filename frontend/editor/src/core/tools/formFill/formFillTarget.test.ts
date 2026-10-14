import { describe, expect, it } from "vitest";
import { formFillTarget } from "@app/tools/formFill/formFillTarget";
import {
  createStirlingFile,
  getFormFillFileId,
  type StirlingFile,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const pdf = (name: string, id: string): StirlingFile =>
  createStirlingFile(
    new File(["%PDF-1.7"], name, { type: "application/pdf" }),
    id as FileId,
  );

const receipt = pdf("justificante.pdf", "receipt");
const law = pdf("ley.pdf", "law");
const form = pdf("F44751.pdf", "form");
const workbench = [receipt, law, form];

describe("formFillTarget", () => {
  it("fills the document whose fields are shown, whatever else is selected", () => {
    const everything = workbench.map((file) => file.fileId);

    expect(formFillTarget(workbench, getFormFillFileId(form), everything)).toBe(
      form,
    );
  });

  it("falls back to the selection while no fields are loaded", () => {
    expect(formFillTarget(workbench, null, [law.fileId])).toBe(law);
  });

  it("falls back to the first file with nothing loaded or selected", () => {
    expect(formFillTarget(workbench, null, [])).toBe(receipt);
  });

  it("ignores loaded fields from a file no longer in the workbench", () => {
    const closed = pdf("closed.pdf", "closed");

    expect(
      formFillTarget(workbench, getFormFillFileId(closed), [law.fileId]),
    ).toBe(law);
  });

  it("has nothing to fill in an empty workbench", () => {
    expect(formFillTarget([], getFormFillFileId(form), [])).toBeNull();
  });
});
