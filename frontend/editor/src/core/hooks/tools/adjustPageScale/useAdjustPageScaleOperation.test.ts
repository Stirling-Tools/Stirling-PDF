import { describe, expect, it } from "vitest";
import { buildAdjustPageScaleFormData } from "@app/hooks/tools/adjustPageScale/adjustPageScaleFormData";
import {
  defaultParameters,
  PageSize,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

const stubFile = () =>
  new File(["data"], "doc.pdf", { type: "application/pdf" });

describe("buildAdjustPageScaleFormData", () => {
  it("includes scaleFactor, pageSize, and orientation by default", () => {
    const formData = buildAdjustPageScaleFormData(
      defaultParameters,
      stubFile(),
    );
    expect(formData.get("scaleFactor")).toBe(
      defaultParameters.scaleFactor.toString(),
    );
    expect(formData.get("pageSize")).toBe(defaultParameters.pageSize);
    expect(formData.get("orientation")).toBe(defaultParameters.orientation);
  });

  it("forwards orientation=LANDSCAPE to the backend", () => {
    const formData = buildAdjustPageScaleFormData(
      { ...defaultParameters, pageSize: PageSize.A4, orientation: "LANDSCAPE" },
      stubFile(),
    );
    expect(formData.get("orientation")).toBe("LANDSCAPE");
    expect(formData.get("pageSize")).toBe("A4");
  });

  it("forwards orientation=PORTRAIT to the backend", () => {
    const formData = buildAdjustPageScaleFormData(
      {
        ...defaultParameters,
        pageSize: PageSize.LEGAL,
        orientation: "PORTRAIT",
      },
      stubFile(),
    );
    expect(formData.get("orientation")).toBe("PORTRAIT");
    expect(formData.get("pageSize")).toBe("LEGAL");
  });

  it("attaches the uploaded file under fileInput", () => {
    const file = stubFile();
    const formData = buildAdjustPageScaleFormData(defaultParameters, file);
    expect(formData.get("fileInput")).toBe(file);
  });
});
