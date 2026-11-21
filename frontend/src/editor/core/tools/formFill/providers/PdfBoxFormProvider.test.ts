import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
} from "@editor/tools/formFill/formApi";
import { PdfBoxFormProvider } from "@editor/tools/formFill/providers/PdfBoxFormProvider";
import type { FormField } from "@editor/tools/formFill/types";

vi.mock("@editor/tools/formFill/formApi", () => ({
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
    const fields = await provider.fetchFields(new Blob([]));
    provider.setFields(fields);

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

  it("does not overwrite active fields inside fetchFields to prevent stale fetch race conditions", async () => {
    const activeField: FormField = {
      ...sampleRadioField,
      widgets: [
        {
          pageIndex: 1,
          x: 10,
          y: 20,
          width: 15,
          height: 15,
          exportValue: "ActiveDocumentValue",
        },
      ],
    };

    const staleField: FormField = {
      ...sampleRadioField,
      widgets: [
        {
          pageIndex: 1,
          x: 10,
          y: 20,
          width: 15,
          height: 15,
          exportValue: "StaleDocumentValue",
        },
      ],
    };

    (fetchFormFieldsWithCoordinates as Mock).mockResolvedValue([staleField]);
    const filledBlob = new Blob(["pdf content"], { type: "application/pdf" });
    (fillFormFields as Mock).mockResolvedValue(filledBlob);

    const provider = new PdfBoxFormProvider();
    // Simulate active fields already set by a newer fetch
    provider.setFields([activeField]);

    // An older, slow fetch resolves later
    await provider.fetchFields(new Blob([]));

    // When filling form, it must use the active fields set via setFields, not the stale fetchFields result
    await provider.fillForm(
      new Blob([]),
      { "MZ1.3-CB_AllgAntragstyp": "0" },
      false,
    );

    expect(fillFormFields).toHaveBeenCalledWith(
      expect.anything(),
      {
        "MZ1.3-CB_AllgAntragstyp": "ActiveDocumentValue",
      },
      false,
    );
  });
});
