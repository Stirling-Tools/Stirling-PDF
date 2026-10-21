// @vitest-environment node
import { describe, expect, it, test } from "vitest";
import {
  adjustPageScaleFromApiParams,
  adjustPageScaleToApiParams,
  buildAdjustPageScaleFormData,
} from "@app/hooks/tools/adjustPageScale/adjustPageScaleFormData";
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

  it("sends the custom dimensions only when pageSize is CUSTOM", () => {
    const custom = buildAdjustPageScaleFormData(
      {
        ...defaultParameters,
        pageSize: PageSize.CUSTOM,
        customWidth: 100,
        customHeight: 50,
        customUnit: "cm",
      },
      stubFile(),
    );
    expect(custom.get("customWidth")).toBe("100");
    expect(custom.get("customHeight")).toBe("50");
    expect(custom.get("customUnit")).toBe("cm");

    const preset = buildAdjustPageScaleFormData(defaultParameters, stubFile());
    expect(preset.has("customWidth")).toBe(false);
  });

  it("attaches the uploaded file under fileInput", () => {
    const file = stubFile();
    const formData = buildAdjustPageScaleFormData(defaultParameters, file);
    expect(formData.get("fileInput")).toBe(file);
  });
});

describe("adjustPageScale mappers", () => {
  test("round-trips backend params", () => {
    const api = adjustPageScaleToApiParams({
      ...defaultParameters,
      scaleFactor: 1.5,
      pageSize: PageSize.A4,
      orientation: "LANDSCAPE",
    });
    const roundTripped = adjustPageScaleToApiParams({
      ...defaultParameters,
      ...adjustPageScaleFromApiParams(api),
    });

    expect(roundTripped).toEqual(api);
  });

  test("keeps the custom defaults when the backend used a preset size", () => {
    const api = adjustPageScaleToApiParams({
      ...defaultParameters,
      pageSize: PageSize.A4,
    });
    const restored = {
      ...defaultParameters,
      ...adjustPageScaleFromApiParams(api),
    };

    expect(restored.customWidth).toBe(defaultParameters.customWidth);
    expect(restored.customHeight).toBe(defaultParameters.customHeight);
    expect(restored.customUnit).toBe(defaultParameters.customUnit);
  });
});
