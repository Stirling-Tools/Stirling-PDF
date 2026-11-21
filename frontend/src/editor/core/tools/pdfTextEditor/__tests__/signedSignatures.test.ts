// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { signedSignatureCount } from "@editor/tools/pdfTextEditor/util/documentRisks";
import {
  FIXTURES,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const opened: EditorDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

async function open(name: string) {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, name))),
  );
  opened.push(doc);
  return doc;
}

test("a signature field nobody has signed is not a signature", async () => {
  expect(signedSignatureCount(await open("signature-empty-field.pdf"))).toBe(0);
});

test("signed documents still count their signatures", async () => {
  expect(signedSignatureCount(await open("signature-one.pdf"))).toBe(1);
  expect(signedSignatureCount(await open("signature-two.pdf"))).toBe(2);
});

test("a signature that can't be inspected counts as signed", () => {
  const failing = (module: object) =>
    ({ module, docPtr: 1 }) as unknown as Parameters<
      typeof signedSignatureCount
    >[0];
  expect(
    signedSignatureCount(
      failing({
        FPDF_GetSignatureCount: () => {
          throw new Error("unreadable");
        },
      }),
    ),
  ).toBe(1);
  expect(
    signedSignatureCount(
      failing({
        FPDF_GetSignatureCount: () => 1,
        FPDF_GetSignatureObject: () => 0,
      }),
    ),
  ).toBe(1);
});
