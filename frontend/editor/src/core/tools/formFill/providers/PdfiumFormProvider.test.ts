import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@app/services/documentBytesCache", () => ({
  getDocumentBytes: vi.fn(),
}));

vi.mock("@app/services/pdfiumScanQueue", () => ({
  runPdfiumScan: (task: () => Promise<unknown>) => task(),
}));

vi.mock("@app/services/pdfiumService", () => ({
  PDF_FORM_FIELD_TYPE: new Proxy({}, { get: (_target, prop) => String(prop) }),
  extractFormFields: vi.fn(async () => []),
  openRawDocumentSafe: vi.fn(async () => 1),
  closeDocAndFreeBuffer: vi.fn(),
  readRawFormType: vi.fn(async () => 0),
  getPdfiumModule: vi.fn(async () => ({
    FPDF_CloseDocument: vi.fn(),
    PDFiumExt_OpenFormFillInfo: vi.fn(() => 1),
    PDFiumExt_InitFormFillEnvironment: vi.fn(() => 0),
  })),
}));

import { allowConsole } from "@app/tests/failOnConsole";

import { getDocumentBytes } from "@app/services/documentBytesCache";
import {
  extractFormFields,
  readRawFormType,
} from "@app/services/pdfiumService";
import { hasAcroForm } from "@app/utils/asciiBytes";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";
import { PdfiumFormProvider } from "@app/tools/formFill/providers/PdfiumFormProvider";

describe("PdfiumFormProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readRawFormType as Mock).mockResolvedValue(0);
  });

  const noLiteralBytes = () =>
    new TextEncoder().encode(
      "%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    );

  it("keeps the fast path when the catalog probe reports no form", async () => {
    const bytes = noLiteralBytes();
    expect(hasAcroForm(bytes)).toBe(false);
    (getDocumentBytes as Mock).mockResolvedValue(bytes.buffer);
    (readRawFormType as Mock).mockResolvedValue(0);

    const provider = new PdfiumFormProvider();
    await provider.fetchFields(new Blob([bytes]));

    expect(readRawFormType).toHaveBeenCalledTimes(1);
    expect(extractFormFields).not.toHaveBeenCalled();
  });

  it("extracts when the catalog probe finds a form the literal scan missed", async () => {
    // qpdf --object-streams=generate hides the catalog, so the byte scan is
    // not a proof of absence; the form-type probe is.
    const bytes = noLiteralBytes();
    (getDocumentBytes as Mock).mockResolvedValue(bytes.buffer);
    (readRawFormType as Mock).mockResolvedValue(1);

    const provider = new PdfiumFormProvider();
    await provider.fetchFields(new Blob([bytes]));

    expect(extractFormFields).toHaveBeenCalledTimes(1);
  });

  it("extracts when the probe cannot answer (unknown is not a miss)", async () => {
    const bytes = noLiteralBytes();
    (getDocumentBytes as Mock).mockResolvedValue(bytes.buffer);
    (readRawFormType as Mock).mockResolvedValue(null);

    const provider = new PdfiumFormProvider();
    await provider.fetchFields(new Blob([bytes]));

    expect(extractFormFields).toHaveBeenCalledTimes(1);
  });

  it("skips the probe above the full-parse limit so large files stay gated", async () => {
    const bytes = noLiteralBytes();
    (getDocumentBytes as Mock).mockResolvedValue(bytes.buffer);
    const largeBlob = new Blob([bytes]);
    Object.defineProperty(largeBlob, "size", {
      value: LARGE_PDF_PARSE_LIMIT,
    });

    const provider = new PdfiumFormProvider();
    await provider.fetchFields(largeBlob);

    expect(readRawFormType).not.toHaveBeenCalled();
    expect(extractFormFields).not.toHaveBeenCalled();
  });

  it("characterizes field mapping: transforms PdfiumFormField into FormField model", async () => {
    const bytes = new TextEncoder().encode("/AcroForm");
    (getDocumentBytes as Mock).mockResolvedValue(bytes.buffer);
    (extractFormFields as Mock).mockResolvedValue([
      {
        name: "form.text1",
        type: "TEXTFIELD",
        value: "sample text",
        isChecked: false,
        isReadOnly: false,
        isRequired: true,
        flags: 0x1000, // multiline bit
        options: [],
        widgets: [
          { pageIndex: 0, x: 50, y: 100, width: 200, height: 30, fontSize: 12 },
        ],
      },
      {
        name: "form.check1",
        type: "CHECKBOX",
        value: "",
        isChecked: true,
        isReadOnly: true,
        isRequired: false,
        flags: 0,
        options: [],
        widgets: [
          {
            pageIndex: 0,
            x: 50,
            y: 150,
            width: 15,
            height: 15,
            exportValue: "CustomVal",
          },
        ],
      },
      {
        name: "form.empty_no_widgets",
        type: "TEXTFIELD",
        value: "",
        isChecked: false,
        isReadOnly: false,
        isRequired: false,
        flags: 0,
        options: [],
        widgets: [],
      },
    ]);

    const provider = new PdfiumFormProvider();
    const fields = await provider.fetchFields(new Blob([bytes]));

    expect(fields).toHaveLength(2); // empty widgets field filtered out
    expect(fields[0]).toMatchObject({
      name: "form.text1",
      label: "text1",
      type: "text",
      value: "sample text",
      required: true,
      readOnly: false,
      multiline: true,
      widgets: [
        { pageIndex: 0, x: 50, y: 100, width: 200, height: 30, fontSize: 12 },
      ],
    });
    expect(fields[1]).toMatchObject({
      name: "form.check1",
      label: "check1",
      type: "checkbox",
      value: "CustomVal",
      required: false,
      readOnly: true,
      multiline: false,
      widgets: [
        {
          pageIndex: 0,
          x: 50,
          y: 150,
          width: 15,
          height: 15,
          exportValue: "CustomVal",
        },
      ],
    });
  });

  it("returns empty array and does not throw when getDocumentBytes fails", async () => {
    allowConsole.warn(/Failed to extract form fields/);
    (getDocumentBytes as Mock).mockRejectedValue(new Error("Disk error"));

    const provider = new PdfiumFormProvider();
    const fields = await provider.fetchFields(new Blob([]));
    expect(fields).toEqual([]);
  });
});
