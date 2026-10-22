import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
} from "@app/tools/formFill/formApi";
import { PdfBoxFormProvider } from "@app/tools/formFill/providers/PdfBoxFormProvider";
import type { FormField } from "@app/tools/formFill/types";

vi.mock("@app/tools/formFill/formApi", () => ({
  fetchFormFieldsWithCoordinates: vi.fn(),
  fillFormFields: vi.fn(),
}));

describe("PdfBoxFormProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleRadioField: FormField = {
    name: "MZ1.3-CB_AllgAntragstyp",
    label: "CB_AllgAntragstyp",
    type: "radio",
    value: "Erhöhungsantrag",
    required: false,
    readOnly: false,
    displayOptions: null,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    options: ["Erstantrag/Weiterleistungsantrag ab Datum", "Erhöhungsantrag"],
    widgets: [
      {
        pageIndex: 1,
        x: 10,
        y: 20,
        width: 15,
        height: 15,
        exportValue: "Erstantrag/Weiterleistungsantrag ab Datum",
      },
      {
        pageIndex: 1,
        x: 10,
        y: 40,
        width: 15,
        height: 15,
        exportValue: "Erhöhungsantrag",
      },
    ],
  };

  it("normalizes initial radio field value to widget index in fetchFields", async () => {
    (fetchFormFieldsWithCoordinates as Mock).mockResolvedValue([
      { ...sampleRadioField },
    ]);

    const provider = new PdfBoxFormProvider();
    const fields = await provider.fetchFields(new Blob([]));

    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe("1");
  });

  it("maps widget index back to export value in fillForm before sending to backend", async () => {
    (fetchFormFieldsWithCoordinates as Mock).mockResolvedValue([
      { ...sampleRadioField },
    ]);
    const filledBlob = new Blob(["pdf content"], {
      type: "application/pdf",
    });
    (fillFormFields as Mock).mockResolvedValue(filledBlob);

    const provider = new PdfBoxFormProvider();
    await provider.fetchFields(new Blob([]));

    const result = await provider.fillForm(
      new Blob([]),
      { "MZ1.3-CB_AllgAntragstyp": "0" },
      false,
    );

    expect(result).toBe(filledBlob);
    expect(fillFormFields).toHaveBeenCalledWith(
      expect.anything(),
      {
        "MZ1.3-CB_AllgAntragstyp": "Erstantrag/Weiterleistungsantrag ab Datum",
      },
      false,
    );
  });
});
