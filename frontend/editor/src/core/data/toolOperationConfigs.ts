import { useMemo } from "react";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import type {
  RegularToolRegistry,
  ToolRegistry,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";
import {
  asRegistryConfig,
  type RegistryToolOperationConfig,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { mergeOperationConfig } from "@app/hooks/tools/merge/useMergeOperation";
import { certSignOperationConfig } from "@app/hooks/tools/certSign/useCertSignOperation";
import { timestampPdfOperationConfig } from "@app/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { signOperationConfig } from "@app/hooks/tools/sign/useSignOperation";
import { addPasswordOperationConfig } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { addStampOperationConfig } from "@app/components/tools/addStamp/useAddStampOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { unlockPdfFormsOperationConfig } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { autoFormDetectionOperationConfig } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { changePermissionsOperationConfig } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { changeMetadataOperationConfig } from "@app/hooks/tools/changeMetadata/useChangeMetadataOperation";
import { editTableOfContentsOperationConfig } from "@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation";
import { cropOperationConfig } from "@app/hooks/tools/crop/useCropOperation";
import { rotateOperationConfig } from "@app/hooks/tools/rotate/useRotateOperation";
import { autoRotateOperationConfig } from "@app/hooks/tools/autoRotate/useAutoRotateOperation";
import { splitOperationConfig } from "@app/hooks/tools/split/useSplitOperation";
import { reorganizePagesOperationConfig } from "@app/hooks/tools/reorganizePages/useReorganizePagesOperation";
import { adjustPageScaleOperationConfig } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { addPageNumbersOperationConfig } from "@app/components/tools/addPageNumbers/useAddPageNumbersOperation";
import { pageLayoutOperationConfig } from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import { bookletImpositionOperationConfig } from "@app/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { singleLargePageOperationConfig } from "@app/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { addAttachmentsOperationConfig } from "@app/hooks/tools/addAttachments/useAddAttachmentsOperation";
import { createPortfolioOperationConfig } from "@app/hooks/tools/createPortfolio/useCreatePortfolioOperation";
import { extractPagesOperationConfig } from "@app/hooks/tools/extractPages/useExtractPagesOperation";
import { extractImagesOperationConfig } from "@app/hooks/tools/extractImages/useExtractImagesOperation";
import { removePagesOperationConfig } from "@app/hooks/tools/removePages/useRemovePagesOperation";
import { removeBlanksOperationConfig } from "@app/hooks/tools/removeBlanks/useRemoveBlanksOperation";
import { removeAnnotationsOperationConfig } from "@app/hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { removeImageOperationConfig } from "@app/hooks/tools/removeImage/useRemoveImageOperation";
import { removePasswordOperationConfig } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { removeCertificateSignOperationConfig } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { autoRenameOperationConfig } from "@app/hooks/tools/autoRename/useAutoRenameOperation";
import { adjustContrastOperationConfig } from "@app/hooks/tools/adjustContrast/useAdjustContrastOperation";
import { repairOperationConfig } from "@app/hooks/tools/repair/useRepairOperation";
import { scannerImageSplitOperationConfig } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { overlayPdfsOperationConfig } from "@app/hooks/tools/overlayPdfs/useOverlayPdfsOperation";
import { replaceColorOperationConfig } from "@app/hooks/tools/replaceColor/useReplaceColorOperation";
import { classifyOperationConfig } from "@app/hooks/tools/classify/useClassifyOperation";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { convertOperationConfig } from "@app/hooks/tools/convert/useConvertOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";

/** Tool ids whose operation config lives here, keyed by the registry id. */
const OPERATION_CONFIGS: Partial<Record<ToolId, RegistryToolOperationConfig>> = {
  merge: asRegistryConfig(mergeOperationConfig),
  certSign: asRegistryConfig(certSignOperationConfig),
  timestampPdf: asRegistryConfig(timestampPdfOperationConfig),
  sign: asRegistryConfig(signOperationConfig),
  addText: asRegistryConfig(signOperationConfig),
  addImage: asRegistryConfig(signOperationConfig),
  annotate: asRegistryConfig(signOperationConfig),
  addPassword: asRegistryConfig(addPasswordOperationConfig),
  watermark: asRegistryConfig(addWatermarkOperationConfig),
  addStamp: asRegistryConfig(addStampOperationConfig),
  sanitize: asRegistryConfig(sanitizeOperationConfig),
  flatten: asRegistryConfig(flattenOperationConfig),
  unlockPDFForms: asRegistryConfig(unlockPdfFormsOperationConfig),
  autoFormDetection: asRegistryConfig(autoFormDetectionOperationConfig),
  changePermissions: asRegistryConfig(changePermissionsOperationConfig),
  changeMetadata: asRegistryConfig(changeMetadataOperationConfig),
  editTableOfContents: asRegistryConfig(editTableOfContentsOperationConfig),
  crop: asRegistryConfig(cropOperationConfig),
  rotate: asRegistryConfig(rotateOperationConfig),
  autoRotate: asRegistryConfig(autoRotateOperationConfig),
  split: asRegistryConfig(splitOperationConfig),
  reorganizePages: asRegistryConfig(reorganizePagesOperationConfig),
  scalePages: asRegistryConfig(adjustPageScaleOperationConfig),
  addPageNumbers: asRegistryConfig(addPageNumbersOperationConfig),
  pageLayout: asRegistryConfig(pageLayoutOperationConfig),
  bookletImposition: asRegistryConfig(bookletImpositionOperationConfig),
  pdfToSinglePage: asRegistryConfig(singleLargePageOperationConfig),
  addAttachments: asRegistryConfig(addAttachmentsOperationConfig),
  createPortfolio: asRegistryConfig(createPortfolioOperationConfig),
  extractPages: asRegistryConfig(extractPagesOperationConfig),
  extractImages: asRegistryConfig(extractImagesOperationConfig),
  removePages: asRegistryConfig(removePagesOperationConfig),
  removeBlanks: asRegistryConfig(removeBlanksOperationConfig),
  removeAnnotations: asRegistryConfig(removeAnnotationsOperationConfig),
  removeImage: asRegistryConfig(removeImageOperationConfig),
  removePassword: asRegistryConfig(removePasswordOperationConfig),
  removeCertSign: asRegistryConfig(removeCertificateSignOperationConfig),
  autoRename: asRegistryConfig(autoRenameOperationConfig),
  adjustContrast: asRegistryConfig(adjustContrastOperationConfig),
  repair: asRegistryConfig(repairOperationConfig),
  scannerImageSplit: asRegistryConfig(scannerImageSplitOperationConfig),
  overlayPdfs: asRegistryConfig(overlayPdfsOperationConfig),
  replaceColor: asRegistryConfig(replaceColorOperationConfig),
  classify: asRegistryConfig(classifyOperationConfig),
  compress: asRegistryConfig(compressOperationConfig),
  convert: asRegistryConfig(convertOperationConfig),
  ocr: asRegistryConfig(ocrOperationConfig),
  redact: asRegistryConfig(redactOperationConfig),
};

/** A tool's operation config, or undefined for a tool that has none. */
export function getToolOperationConfig(
  toolId: string,
): RegistryToolOperationConfig | undefined {
  return OPERATION_CONFIGS[toolId as ToolId];
}

/** `registry` with each entry's operation config merged in. */
export function withOperationConfigs<R extends Record<string, ToolRegistryEntry>>(
  registry: R,
): R {
  const merged: Record<string, ToolRegistryEntry> = {};
  for (const [id, entry] of Object.entries(registry)) {
    const config = entry.operationConfig ?? OPERATION_CONFIGS[id as ToolId];
    if (!config || config === entry.operationConfig) {
      merged[id] = entry;
      continue;
    }
    merged[id] = { ...entry, operationConfig: config };
  }
  return merged as R;
}

/** The registry as the automation and pipeline surfaces need it: every tool carries its operation config. */
export function useOperationConfigCatalog(): {
  allTools: ToolRegistry;
  regularTools: RegularToolRegistry;
} {
  const { allTools, regularTools } = useToolRegistry();
  const mergedAllTools = useMemo(() => withOperationConfigs(allTools), [allTools]);
  const mergedRegularTools = useMemo(
    () => withOperationConfigs(regularTools),
    [regularTools],
  );
  return useMemo(
    () => ({ allTools: mergedAllTools, regularTools: mergedRegularTools }),
    [mergedAllTools, mergedRegularTools],
  );
}
