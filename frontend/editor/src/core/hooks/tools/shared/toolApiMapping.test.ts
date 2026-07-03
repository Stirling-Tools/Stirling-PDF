import { describe, expect, test } from "vitest";
import {
  identityMapping,
  objectToFormData,
  type ToolApiParams,
} from "@app/hooks/tools/shared/toolApiMapping";

describe("objectToFormData", () => {
  test("serializes primitive fields to string form values", () => {
    const request: ToolApiParams["/api/v1/misc/compress-pdf"] = {
      optimizeLevel: 3,
      grayscale: true,
      linearize: false,
      expectedOutputSize: "25KB",
    };
    const formData = objectToFormData(request);

    expect(formData.get("optimizeLevel")).toBe("3");
    expect(formData.get("grayscale")).toBe("true");
    expect(formData.get("linearize")).toBe("false");
    expect(formData.get("expectedOutputSize")).toBe("25KB");
  });

  test("omits fields whose value is undefined", () => {
    const request: ToolApiParams["/api/v1/misc/compress-pdf"] = {
      optimizeLevel: 5,
      expectedOutputSize: undefined,
    };
    const formData = objectToFormData(request);

    expect(formData.has("optimizeLevel")).toBe(true);
    expect(formData.has("expectedOutputSize")).toBe(false);
  });

  test("expands arrays into repeated fields", () => {
    const request: ToolApiParams["/api/v1/misc/add-attachments"] = {
      attachments: ["a.png", "b.png", "c.png"],
    };
    const formData = objectToFormData(request);

    expect(formData.getAll("attachments")).toEqual(["a.png", "b.png", "c.png"]);
  });

  test("throws on a non-primitive field value rather than dropping it", () => {
    // A redact request whose structured field was left un-encoded: the array
    // items are objects, which cannot be sent as form fields.
    const request: ToolApiParams["/api/v1/security/redact"] = {
      redactions: [{ x: 1, y: 2 }],
    };

    expect(() => objectToFormData(request)).toThrow(/field "redactions"/);
  });

  test("appends a single file under its field name", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const request: ToolApiParams["/api/v1/misc/compress-pdf"] = {
      optimizeLevel: 5,
    };
    const formData = objectToFormData(request, { fileInput: file });

    expect(formData.get("fileInput")).toBe(file);
    expect(formData.get("optimizeLevel")).toBe("5");
  });

  test("appends multiple files under the same field name", () => {
    const files = [
      new File(["1"], "a.pdf", { type: "application/pdf" }),
      new File(["2"], "b.pdf", { type: "application/pdf" }),
    ];
    const formData = objectToFormData({}, { fileInput: files });

    expect(formData.getAll("fileInput")).toEqual(files);
  });

  test("appends named file fields alongside fileInput", () => {
    const doc = new File(["d"], "doc.pdf", { type: "application/pdf" });
    const stamp = new File(["s"], "stamp.png", { type: "image/png" });
    const formData = objectToFormData(
      {},
      { fileInput: doc, stampImage: stamp },
    );

    expect(formData.get("fileInput")).toBe(doc);
    expect(formData.get("stampImage")).toBe(stamp);
  });
});

describe("identityMapping", () => {
  // A generated backend model whose frontend shape would match it 1:1.
  type SampleParams = ToolApiParams["/api/v1/general/remove-pages"];

  test("passes params through unchanged in both directions", () => {
    const { toApiParams, fromApiParams } = identityMapping<SampleParams>();
    const params: SampleParams = { pageNumbers: "1,3,5-9" };

    expect(toApiParams(params)).toBe(params);
    expect(fromApiParams(params)).toEqual(params);
  });
});
