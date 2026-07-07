import { describe, expect, test } from "vitest";
import { type RegistryToolOperationConfig } from "@app/hooks/tools/shared/toolOperationTypes";
import { objectToFormData } from "@app/hooks/tools/shared/toolApiMapping";

// Pilot tools.
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { rotateOperationConfig } from "@app/hooks/tools/rotate/useRotateOperation";
import { mergeOperationConfig } from "@app/hooks/tools/merge/useMergeOperation";
import { splitOperationConfig } from "@app/hooks/tools/split/useSplitOperation";
// Rolled out in Phase 3.
import { addAttachmentsOperationConfig } from "@app/hooks/tools/addAttachments/useAddAttachmentsOperation";
import { addPageNumbersOperationConfig } from "@app/components/tools/addPageNumbers/useAddPageNumbersOperation";
import { addPasswordOperationConfig } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { addStampOperationConfig } from "@app/components/tools/addStamp/useAddStampOperation";
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { adjustPageScaleOperationConfig } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { autoRenameOperationConfig } from "@app/hooks/tools/autoRename/useAutoRenameOperation";
import { bookletImpositionOperationConfig } from "@app/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { certSignOperationConfig } from "@app/hooks/tools/certSign/useCertSignOperation";
import { changePermissionsOperationConfig } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { cropOperationConfig } from "@app/hooks/tools/crop/useCropOperation";
import { editTableOfContentsOperationConfig } from "@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation";
import { extractImagesOperationConfig } from "@app/hooks/tools/extractImages/useExtractImagesOperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { overlayPdfsOperationConfig } from "@app/hooks/tools/overlayPdfs/useOverlayPdfsOperation";
import { pageLayoutOperationConfig } from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";
import { removeBlanksOperationConfig } from "@app/hooks/tools/removeBlanks/useRemoveBlanksOperation";
import { removeCertificateSignOperationConfig } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { removeImageOperationConfig } from "@app/hooks/tools/removeImage/useRemoveImageOperation";
import { removePagesOperationConfig } from "@app/hooks/tools/removePages/useRemovePagesOperation";
import { removePasswordOperationConfig } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { reorganizePagesOperationConfig } from "@app/hooks/tools/reorganizePages/useReorganizePagesOperation";
import { repairOperationConfig } from "@app/hooks/tools/repair/useRepairOperation";
import { replaceColorOperationConfig } from "@app/hooks/tools/replaceColor/useReplaceColorOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { scannerImageSplitOperationConfig } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { singleLargePageOperationConfig } from "@app/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { timestampPdfOperationConfig } from "@app/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { unlockPdfFormsOperationConfig } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";

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

      // toApiParams(defaults) must produce a body objectToFormData can serialize
      // (i.e. only primitives / arrays of primitives). A mapper that leaked a
      // structured value would throw here.
      const params =
        config.defaultParameters ?? FALLBACK_PARAMS[config.operationType] ?? {};
      const apiParams = config.toApiParams!(params);
      expect(() =>
        objectToFormData(apiParams, { fileInput: file }),
      ).not.toThrow();
    },
  );
});

describe("redact mappers", () => {
  test("toApiParams builds the auto-redact body from UI parameters", () => {
    const api = redactOperationConfig.toApiParams({
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
    const api = redactOperationConfig.toApiParams({
      mode: "automatic",
      wordsToRedact: ["secret"],
      useRegex: false,
      wholeWordSearch: true,
      redactColor: "#123456",
      customPadding: 0.1,
      convertPDFToImage: true,
    });
    const roundTripped = redactOperationConfig.toApiParams({
      mode: "automatic",
      wordsToRedact: [],
      useRegex: false,
      wholeWordSearch: false,
      redactColor: "#000000",
      customPadding: 0,
      convertPDFToImage: false,
      ...redactOperationConfig.fromApiParams(api),
    });

    expect(roundTripped).toEqual(api);
  });
});
