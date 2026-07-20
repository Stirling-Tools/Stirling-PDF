import { describe, expect, test } from "vitest";
import {
  ToolType,
  type RegistryToolOperationConfig,
} from "@editor/hooks/tools/shared/toolOperationTypes";
import { objectToFormData } from "@editor/hooks/tools/shared/toolApiMapping";

// Pilot tools.
import { compressOperationConfig } from "@editor/hooks/tools/compress/useCompressOperation";
import { rotateOperationConfig } from "@editor/hooks/tools/rotate/useRotateOperation";
import { mergeOperationConfig } from "@editor/hooks/tools/merge/useMergeOperation";
import { splitOperationConfig } from "@editor/hooks/tools/split/useSplitOperation";
// Rolled out in Phase 3.
import { addAttachmentsOperationConfig } from "@editor/hooks/tools/addAttachments/useAddAttachmentsOperation";
import { addPageNumbersOperationConfig } from "@editor/components/tools/addPageNumbers/useAddPageNumbersOperation";
import { addPasswordOperationConfig } from "@editor/hooks/tools/addPassword/useAddPasswordOperation";
import { addStampOperationConfig } from "@editor/components/tools/addStamp/useAddStampOperation";
import { addWatermarkOperationConfig } from "@editor/hooks/tools/addWatermark/useAddWatermarkOperation";
import { adjustPageScaleOperationConfig } from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { autoRenameOperationConfig } from "@editor/hooks/tools/autoRename/useAutoRenameOperation";
import { bookletImpositionOperationConfig } from "@editor/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { certSignOperationConfig } from "@editor/hooks/tools/certSign/useCertSignOperation";
import { changeMetadataOperationConfig } from "@editor/hooks/tools/changeMetadata/useChangeMetadataOperation";
import { changePermissionsOperationConfig } from "@editor/hooks/tools/changePermissions/useChangePermissionsOperation";
import { cropOperationConfig } from "@editor/hooks/tools/crop/useCropOperation";
import { editTableOfContentsOperationConfig } from "@editor/hooks/tools/editTableOfContents/useEditTableOfContentsOperation";
import { extractImagesOperationConfig } from "@editor/hooks/tools/extractImages/useExtractImagesOperation";
import { flattenOperationConfig } from "@editor/hooks/tools/flatten/useFlattenOperation";
import { ocrOperationConfig } from "@editor/hooks/tools/ocr/useOCROperation";
import { overlayPdfsOperationConfig } from "@editor/hooks/tools/overlayPdfs/useOverlayPdfsOperation";
import { pageLayoutOperationConfig } from "@editor/hooks/tools/pageLayout/usePageLayoutOperation";
import { redactOperationConfig } from "@editor/hooks/tools/redact/useRedactOperation";
import { removeBlanksOperationConfig } from "@editor/hooks/tools/removeBlanks/useRemoveBlanksOperation";
import { removeCertificateSignOperationConfig } from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { removeImageOperationConfig } from "@editor/hooks/tools/removeImage/useRemoveImageOperation";
import { removePagesOperationConfig } from "@editor/hooks/tools/removePages/useRemovePagesOperation";
import { removePasswordOperationConfig } from "@editor/hooks/tools/removePassword/useRemovePasswordOperation";
import { reorganizePagesOperationConfig } from "@editor/hooks/tools/reorganizePages/useReorganizePagesOperation";
import { repairOperationConfig } from "@editor/hooks/tools/repair/useRepairOperation";
import { replaceColorOperationConfig } from "@editor/hooks/tools/replaceColor/useReplaceColorOperation";
import { sanitizeOperationConfig } from "@editor/hooks/tools/sanitize/useSanitizeOperation";
import { scannerImageSplitOperationConfig } from "@editor/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { singleLargePageOperationConfig } from "@editor/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { timestampPdfOperationConfig } from "@editor/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { unlockPdfFormsOperationConfig } from "@editor/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";

// Every tool migrated to the mapper seam. Erased to the registry shape so one
// loop can invoke toApiParams(defaultParameters) uniformly regardless of the
// tool's own parameter type.
const MIGRATED_CONFIGS = [
  compressOperationConfig,
  rotateOperationConfig,
  mergeOperationConfig,
  splitOperationConfig,
  addAttachmentsOperationConfig,
  addPageNumbersOperationConfig,
  addPasswordOperationConfig,
  addStampOperationConfig,
  addWatermarkOperationConfig,
  adjustPageScaleOperationConfig,
  autoRenameOperationConfig,
  bookletImpositionOperationConfig,
  certSignOperationConfig,
  changeMetadataOperationConfig,
  changePermissionsOperationConfig,
  cropOperationConfig,
  editTableOfContentsOperationConfig,
  extractImagesOperationConfig,
  flattenOperationConfig,
  ocrOperationConfig,
  overlayPdfsOperationConfig,
  pageLayoutOperationConfig,
  redactOperationConfig,
  removeBlanksOperationConfig,
  removeCertificateSignOperationConfig,
  removeImageOperationConfig,
  removePagesOperationConfig,
  removePasswordOperationConfig,
  reorganizePagesOperationConfig,
  repairOperationConfig,
  replaceColorOperationConfig,
  sanitizeOperationConfig,
  scannerImageSplitOperationConfig,
  singleLargePageOperationConfig,
  timestampPdfOperationConfig,
  unlockPdfFormsOperationConfig,
  // Erase each tool's own TParams to the shared registry shape (the same
  // existential boundary asRegistryConfig applies) so one loop can call
  // toApiParams(defaultParameters) uniformly.
] as unknown as RegistryToolOperationConfig[];

// A few tools have no static defaultParameters (the UI always supplies a value);
// give the sweep a minimal valid parameter set for those.
const FALLBACK_PARAMS: Record<string, Record<string, unknown>> = {
  editTableOfContents: { bookmarks: [], replaceExisting: false },
};

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
      // field that buildFormData flattens itself (e.g. changeMetadata's
      // allRequestParams map) is exercised too, not just tools whose mapper
      // output is directly objectToFormData-able. Custom tools have no
      // buildFormData, so fall back to serializing the mapper output directly.
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
