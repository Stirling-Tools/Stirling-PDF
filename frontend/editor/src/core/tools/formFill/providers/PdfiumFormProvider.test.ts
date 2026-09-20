import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@app/services/documentBytesCache", () => ({
  getDocumentBytes: vi.fn(),
}));

vi.mock("@app/services/pdfiumScanQueue", () => ({
  runPdfiumScan: (task: () => Promise<unknown>) => task(),
}));

vi.mock("@app/services/documentFormProbe", () => ({
  documentHasFormFieldsFor: vi.fn(async () => false),
}));

vi.mock("@app/services/pdfiumService", () => ({
  PDF_FORM_FIELD_TYPE: new Proxy({}, { get: (_target, prop) => String(prop) }),
  extractFormFields: vi.fn(async () => []),
  openRawDocumentSafe: vi.fn(async () => 1),
  closeDocAndFreeBuffer: vi.fn(),
  getPdfiumModule: vi.fn(async () => ({
    FPDF_CloseDocument: vi.fn(),
    PDFiumExt_OpenFormFillInfo: vi.fn(() => 1),
    PDFiumExt_InitFormFillEnvironment: vi.fn(() => 0),
  })),
}));

import { allowConsole } from "@app/tests/failOnConsole";

import { getDocumentBytes } from "@app/services/documentBytesCache";
import { documentHasFormFieldsFor } from "@app/services/documentFormProbe";
import { extractFormFields } from "@app/services/pdfiumService";
import { PdfiumFormProvider } from "@app/tools/formFill/providers/PdfiumFormProvider";

describe("PdfiumFormProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (documentHasFormFieldsFor as Mock).mockResolvedValue(false);
  });

  it("returns [] and skips extraction when the document has no form", async () => {
    const provider = new PdfiumFormProvider();
    const file = new Blob([]);
    const fields = await provider.fetchFields(file);

    expect(fields).toEqual([]);
    expect(documentHasFormFieldsFor).toHaveBeenCalledWith(file);
    // The answer comes from the per-document probe, so no bytes are read.
    expect(getDocumentBytes).not.toHaveBeenCalled();
    expect(extractFormFields).not.toHaveBeenCalled();
  });

  it("extracts when the probe finds a form the literal scan missed", async () => {
    // qpdf --object-streams=generate hides the catalog, so the byte scan is
    // not proof of absence; the catalog probe is.
    (getDocumentBytes as Mock).mockResolvedValue(new ArrayBuffer(16));
    (documentHasFormFieldsFor as Mock).mockResolvedValue(true);

    const provider = new PdfiumFormProvider();
    await provider.fetchFields(new Blob([]));

    expect(extractFormFields).toHaveBeenCalledTimes(1);
  });

  it("characterizes field mapping: transforms PdfiumFormField into FormField model", async () => {
    const bytes = new TextEncoder().encode("/AcroForm");
    (documentHasFormFieldsFor as Mock).mockResolvedValue(true);
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
    (documentHasFormFieldsFor as Mock).mockResolvedValue(true);
    (getDocumentBytes as Mock).mockRejectedValue(new Error("Disk error"));

    const provider = new PdfiumFormProvider();
    const fields = await provider.fetchFields(new Blob([]));
    expect(fields).toEqual([]);
  });
});
