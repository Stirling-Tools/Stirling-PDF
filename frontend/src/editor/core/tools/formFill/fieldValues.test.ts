import { describe, expect, it } from "vitest";
import {
  resolveCanonicalFormValues,
  resolveRadioWidgetIndex,
} from "@app/tools/formFill/fieldValues";
import type { FormField } from "@app/tools/formFill/types";

describe("fieldValues", () => {
  const sampleRadioField: FormField = {
    name: "MZ1.3-CB_AllgAntragstyp",
    label: "CB_AllgAntragstyp",
    type: "radio",
    value: "0",
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

  const sampleTextField: FormField = {
    name: "applicantName",
    label: "Applicant Name",
    type: "text",
    value: "Max Mustermann",
    required: true,
    readOnly: false,
    options: null,
    displayOptions: null,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets: null,
  };

  describe("resolveCanonicalFormValues", () => {
    it("maps radio widget index to export value containing slash or non-ASCII", () => {
      const fields = [sampleRadioField, sampleTextField];
      const values = {
        "MZ1.3-CB_AllgAntragstyp": "1",
        applicantName: "Erika Mustermann",
      };

      const result = resolveCanonicalFormValues(fields, values);

      expect(result["MZ1.3-CB_AllgAntragstyp"]).toBe("Erhöhungsantrag");
      expect(result.applicantName).toBe("Erika Mustermann");
    });

    it("maps index 0 to option containing slashes", () => {
      const fields = [sampleRadioField];
      const values = { "MZ1.3-CB_AllgAntragstyp": "0" };

      const result = resolveCanonicalFormValues(fields, values);

      expect(result["MZ1.3-CB_AllgAntragstyp"]).toBe(
        "Erstantrag/Weiterleistungsantrag ab Datum",
      );
    });

    it("falls back to field.options when widget exportValue is unset", () => {
      const fieldWithoutWidgetExports: FormField = {
        name: "choiceGroup",
        label: "Choice Group",
        type: "radio",
        value: "",
        required: false,
        readOnly: false,
        displayOptions: null,
        multiSelect: false,
        multiline: false,
        tooltip: null,
        options: ["Option A", "Option B"],
        widgets: [
          { pageIndex: 0, x: 0, y: 0, width: 10, height: 10 },
          { pageIndex: 0, x: 0, y: 20, width: 10, height: 10 },
        ],
      };

      const result = resolveCanonicalFormValues([fieldWithoutWidgetExports], {
        choiceGroup: "1",
      });

      expect(result.choiceGroup).toBe("Option B");
    });

    it("preserves non-radio and unmapped values as-is", () => {
      const fields = [sampleRadioField, sampleTextField];
      const values = {
        unknownField: "someValue",
        applicantName: "Jane Doe",
      };

      const result = resolveCanonicalFormValues(fields, values);

      expect(result.unknownField).toBe("someValue");
      expect(result.applicantName).toBe("Jane Doe");
    });
  });

  describe("resolveRadioWidgetIndex", () => {
    it("maps raw on-state string with non-ASCII characters to widget index string", () => {
      const index = resolveRadioWidgetIndex(
        sampleRadioField,
        "Erhöhungsantrag",
      );
      expect(index).toBe("1");
    });

    it("maps raw on-state string with slash to widget index string", () => {
      const index = resolveRadioWidgetIndex(
        sampleRadioField,
        "Erstantrag/Weiterleistungsantrag ab Datum",
      );
      expect(index).toBe("0");
    });

    it("returns original value when value does not match any widget export", () => {
      const index = resolveRadioWidgetIndex(sampleRadioField, "NonExistent");
      expect(index).toBe("NonExistent");
    });

    it("handles null and undefined values safely", () => {
      expect(resolveRadioWidgetIndex(sampleRadioField, null)).toBe("");
      expect(resolveRadioWidgetIndex(sampleRadioField, undefined)).toBe("");
    });
  });
});
