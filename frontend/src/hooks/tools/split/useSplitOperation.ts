import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SplitParameters, defaultParameters } from './useSplitParameters';
import { SPLIT_MODES } from '../../../constants/splitConstants';
import { useToolResources } from '../shared/useToolResources';

// Static functions that can be used by both the hook and automation executor
export const buildSplitFormData = (parameters: SplitParameters, file: File): FormData => {
  const formData = new FormData();

  formData.append("fileInput", file);

  switch (parameters.mode) {
    case SPLIT_MODES.BY_PAGES:
      formData.append("pageNumbers", parameters.pages);
      break;
    case SPLIT_MODES.BY_SECTIONS:
      formData.append("horizontalDivisions", parameters.hDiv);
      formData.append("verticalDivisions", parameters.vDiv);
      formData.append("merge", parameters.merge.toString());
      break;
    case SPLIT_MODES.BY_SIZE_OR_COUNT:
      formData.append(
        "splitType",
        parameters.splitType === "size" ? "0" : parameters.splitType === "pages" ? "1" : "2"
      );
      formData.append("splitValue", parameters.splitValue);
      break;
    case SPLIT_MODES.BY_CHAPTERS:
      formData.append("bookmarkLevel", parameters.bookmarkLevel);
      formData.append("includeMetadata", parameters.includeMetadata.toString());
      formData.append("allowDuplicates", parameters.allowDuplicates.toString());
      break;
    default:
      throw new Error(`Unknown split mode: ${parameters.mode}`);
  }

  return formData;
};

export const getSplitEndpoint = (parameters: SplitParameters): string => {
  switch (parameters.mode) {
    case SPLIT_MODES.BY_PAGES:
      return "/api/v1/general/split-pages";
    case SPLIT_MODES.BY_SECTIONS:
      return "/api/v1/general/split-pdf-by-sections";
    case SPLIT_MODES.BY_SIZE_OR_COUNT:
      return "/api/v1/general/split-by-size-or-count";
    case SPLIT_MODES.BY_CHAPTERS:
      return "/api/v1/general/split-pdf-by-chapters";
    default:
      throw new Error(`Unknown split mode: ${parameters.mode}`);
  }
};

// Static configuration object
export const splitOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSplitFormData,
  operationType: 'splitPdf',
  endpoint: getSplitEndpoint,
  filePrefix: 'split_',
  defaultParameters,
} as const;

export const useSplitOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // Custom response handler that extracts ZIP files
  // Can't add to exported config because it requires access to the zip code so must be part of the hook
  const responseHandler = useCallback(async (blob: Blob, _originalFiles: File[]): Promise<File[]> => {
    // Split operations return ZIP files with multiple PDF pages
    return await extractZipFiles(blob);
  }, [extractZipFiles]);

  const splitConfig: ToolOperationConfig<SplitParameters> = {
    ...splitOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(t('split.error.failed', 'An error occurred while splitting the PDF.'))
  };

  return useToolOperation(splitConfig);
};
