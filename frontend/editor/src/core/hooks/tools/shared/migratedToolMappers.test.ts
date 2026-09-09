import { describe, expect, test } from "vitest";
import {
  ToolType,
  type RegistryToolOperationConfig,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { objectToFormData } from "@app/hooks/tools/shared/toolApiMapping";

// Pilot tools.
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { rotateOperationConfig } from "@app/hooks/tools/rotate/useRotateOperation";
import { mergeOperationConfig } from "@app/hooks/tools/merge/useMergeOperation";
import { splitOperationConfig } from "@app/hooks/tools/split/useSplitOperation";
// Rolled out in Phase 3.
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { adjustPageScaleOperationConfig } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { certSignOperationConfig } from "@app/hooks/tools/certSign/useCertSignOperation";
import { cropOperationConfig } from "@app/hooks/tools/crop/useCropOperation";
import { extractImagesOperationConfig } from "@app/hooks/tools/extractImages/useExtractImagesOperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { pageLayoutOperationConfig } from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";
import { removeCertificateSignOperationConfig } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { removePagesOperationConfig } from "@app/hooks/tools/removePages/useRemovePagesOperation";
import { removePasswordOperationConfig } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { timestampPdfOperationConfig } from "@app/hooks/tools/timestampPdf/useTimestampPdfOperation";

// Every tool migrated to the mapper seam. Erased to the registry shape so one
// loop can invoke toApiParams(defaultParameters) uniformly regardless of the
// tool's own parameter type.
const MIGRATED_CONFIGS = [
  compressOperationConfig,
  rotateOperationConfig,
  mergeOperationConfig,
  splitOperationConfig,
  addWatermarkOperationConfig,
  adjustPageScaleOperationConfig,
  certSignOperationConfig,
  cropOperationConfig,
  extractImagesOperationConfig,
  flattenOperationConfig,
  ocrOperationConfig,
  pageLayoutOperationConfig,
  redactOperationConfig,
  removeCertificateSignOperationConfig,
  removePagesOperationConfig,
  removePasswordOperationConfig,
  sanitizeOperationConfig,
  timestampPdfOperationConfig,
  // Erase each tool's own TParams to the shared registry shape (the same
  // existential boundary asRegistryConfig applies) so one loop can call
  // toApiParams(defaultParameters) uniformly.
] as unknown as RegistryToolOperationConfig[];

// A few tools have no static defaultParameters (the UI always supplies a value);
// give the sweep a minimal valid parameter set for those.
const FALLBACK_PARAMS: Record<string, Record<string, unknown>> = {};

describe("migrated tool mappers (sweep)", () => {
  const file = new File(["x"], "test.pdf", { type: "application/pdf" });

  test.each(
    MIGRATED_CONFIGS.map((config) => [config.operationType, config] as const),
  )(
    "%s: exposes both mappers and serializes its default parameters cleanly",
    (_name, config) => {
      // Every migrated tool authors both directions of the mapping.
      expect(config.toApiParams).toBeDefined();
      expect(config.fromApiParams).toBeDefined();

      // Serialize the defaults through the tool's own buildFormData - the real
      // path the executor uses - so a tool whose toApiParams carries a structured
      // field that buildFormData flattens itself is exercised too, not just
      // tools whose mapper output is directly objectToFormData-able. Custom
      // tools have no buildFormData, so fall back to serializing the mapper
      // output directly.
      const params =
        config.defaultParameters ?? FALLBACK_PARAMS[config.operationType] ?? {};
      if (config.toolType === ToolType.multiFile) {
        const build = config.buildFormData;
        expect(() => build(params, [file])).not.toThrow();
      } else if (config.toolType === ToolType.singleFile) {
        const build = config.buildFormData;
        expect(() => build(params, file)).not.toThrow();
      } else {
        const toApiParams = config.toApiParams!;
        expect(() =>
          objectToFormData(toApiParams(params), { fileInput: file }),
        ).not.toThrow();
      }
    },
  );
});

describe("redact mappers", () => {
  test("toApiParams builds the auto-redact body from UI parameters", () => {
    const api = redactOperationConfig.toApiParams!({
      mode: "automatic",
      wordsToRedact: ["foo", "bar"],
      useRegex: true,
      wholeWordSearch: false,
      redactColor: "#ff0000",
      customPadding: 0.2,
      convertPDFToImage: false,
    });

    expect(api).toEqual({
      listOfText: "foo\nbar",
      useRegex: true,
      wholeWordSearch: false,
      redactColor: "ff0000", // '#' stripped for the backend
      customPadding: 0.2,
      convertPDFToImage: false,
    });
  });

  test("round-trips through fromApiParams", () => {
    const api = redactOperationConfig.toApiParams!({
      mode: "automatic",
      wordsToRedact: ["secret"],
      useRegex: false,
      wholeWordSearch: true,
      redactColor: "#123456",
      customPadding: 0.1,
      convertPDFToImage: true,
    });
    const roundTripped = redactOperationConfig.toApiParams!({
      mode: "automatic",
      wordsToRedact: [],
      useRegex: false,
      wholeWordSearch: false,
      redactColor: "#000000",
      customPadding: 0,
      convertPDFToImage: false,
      ...redactOperationConfig.fromApiParams!(api),
    });

    expect(roundTripped).toEqual(api);
  });
});
