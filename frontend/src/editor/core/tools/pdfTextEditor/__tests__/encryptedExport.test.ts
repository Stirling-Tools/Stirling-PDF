// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PDFDocument, PDFHeader, StandardFonts } from "@cantoo/pdf-lib";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { PdfiumSave } from "@editor/tools/pdfTextEditor/pdfium/PdfiumSave";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import { readEncryptionDictionary as protection } from "@editor/tests/helpers/pdf-encryption";

vi.mock(
  "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@editor/tools/pdfTextEditor/charcode/CharcodeStrategy")
    >()),
    getActiveCharcodeStrategy: () => "helvetica",
  }),
);

const opened: EditorDocument[] = [];
const owner = "owner-test";

async function open(bytes: Uint8Array, password: string) {
  const doc = await EditorDocument.open(bytes, password);
  opened.push(doc);
  return doc;
}

async function savedBytes(doc: EditorDocument) {
  const { blob } = await exportToBlob(doc, "encrypted.pdf");
  return new Uint8Array(await blob.arrayBuffer());
}

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => vi.unstubAllGlobals());

describe.each([
  { name: "RC4 40-bit", minor: 3, revision: 2 },
  { name: "RC4 128-bit", minor: 4, revision: 3 },
  { name: "AES 128-bit", minor: 6, revision: 4 },
  { name: "AES 256-bit", minor: 7, revision: 6 },
])("$name text exports", ({ minor, revision }) => {
  it.each([
    { role: "reader", reader: "reader-test", credential: "reader-test" },
    { role: "owner", reader: "reader-test", credential: owner },
    { role: "owner-only", reader: "", credential: owner },
  ])(
    "preserves both credentials and restrictions across repeated $role saves",
    async ({ reader, credential }) => {
      const pdf = await PDFDocument.create();
      pdf.context.header = PDFHeader.forVersion(1, minor);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf
        .addPage([300, 300])
        .drawText("Original text", { font, size: 12, x: 20, y: 200 });
      let bytes: Uint8Array;
      if (revision === 6) {
        const plain = await open(await pdf.save(), "");
        expect(
          plain.module.EPDF_SetEncryption(
            plain.docPtr,
            reader,
            owner,
            -4 & ~16,
          ),
        ).toBe(true);
        bytes = PdfiumSave.serialize(plain);
      } else {
        pdf.encrypt({
          userPassword: reader,
          ownerPassword: owner,
          permissions: { modifying: true, copying: false },
        });
        bytes = await pdf.save({ useObjectStreams: false });
      }
      const originalProtection = await protection(bytes);
      expect(originalProtection.ID).toBeDefined();
      const doc = await open(bytes, credential);
      const originalAccess = readPdfiumAccess(
        doc.module,
        doc.docPtr,
        credential,
      );
      expect(originalAccess).toMatchObject({
        encrypted: true,
        encryptionRevision: revision,
      });
      expect(await savedBytes(doc)).toEqual(bytes);
      PdfiumTextReader.populate(doc, doc.page(0));
      const run = doc.page(0).runs[0];
      expect(run.text).toBe("Original text");

      for (const nextText of ["First edit", "Second edit"]) {
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }).apply(
          doc,
        );
        const saved = await savedBytes(doc);
        expect(await protection(saved)).toEqual(originalProtection);
        for (const password of [reader, owner]) {
          const reopened = await open(saved, password);
          expect(
            readPdfiumAccess(reopened.module, reopened.docPtr, password),
          ).toMatchObject({
            encrypted: true,
            permissions: originalAccess.permissions,
            encryptionRevision: revision,
            ownerAuthenticated: password === owner,
          });
          PdfiumTextReader.populate(reopened, reopened.page(0));
          expect(
            reopened
              .page(0)
              .runs.map((item) => item.text)
              .join(" "),
          ).toContain(nextText);
        }
        await expect(
          EditorDocument.open(saved, "wrong-password"),
        ).rejects.toThrow();
        if (reader)
          await expect(EditorDocument.open(saved, "")).rejects.toThrow();
      }
    },
  );
});
