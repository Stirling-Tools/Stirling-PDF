import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SplitParameters, defaultParameters } from './useSplitParameters';
import { SPLIT_METHODS } from '../../../constants/splitConstants';
import { useToolResources } from '../shared/useToolResources';

// Static functions that can be used by both the hook and automation executor
export const buildSplitFormData = (parameters: SplitParameters, file: File): FormData => {
  const formData = new FormData();

  formData.append("fileInput", file);

  switch (parameters.method) {
    case SPLIT_METHODS.BY_PAGES:
      formData.append("pageNumbers", parameters.pages);
      break;
    case SPLIT_METHODS.BY_SECTIONS:
      formData.append("horizontalDivisions", parameters.hDiv);
      formData.append("verticalDivisions", parameters.vDiv);
      formData.append("merge", parameters.merge.toString());
      break;
    case SPLIT_METHODS.BY_SIZE:
      formData.append("splitType", "0");
      formData.append("splitValue", parameters.splitValue);
      break;
    case SPLIT_METHODS.BY_PAGE_COUNT:
      formData.append("splitType", "1");
      formData.append("splitValue", parameters.splitValue);
      break;
    case SPLIT_METHODS.BY_DOC_COUNT:
      formData.append("splitType", "2");
      formData.append("splitValue", parameters.splitValue);
      break;
    case SPLIT_METHODS.BY_CHAPTERS:
      formData.append("bookmarkLevel", parameters.bookmarkLevel);
      formData.append("includeMetadata", parameters.includeMetadata.toString());
      formData.append("allowDuplicates", parameters.allowDuplicates.toString());
      break;
    case SPLIT_METHODS.BY_PAGE_DIVIDER:
      formData.append("duplexMode", parameters.duplexMode.toString());
      break;
    default:
      throw new Error(`Unknown split method: ${parameters.method}`);
  }

  return formData;
};

export const getSplitEndpoint = (parameters: SplitParameters): string => {
  switch (parameters.method) {
    case SPLIT_METHODS.BY_PAGES:
      return "/api/v1/general/split-pages";
    case SPLIT_METHODS.BY_SECTIONS:
      return "/api/v1/general/split-pdf-by-sections";
    case SPLIT_METHODS.BY_SIZE:
    case SPLIT_METHODS.BY_PAGE_COUNT:
    case SPLIT_METHODS.BY_DOC_COUNT:
      return "/api/v1/general/split-by-size-or-count";
    case SPLIT_METHODS.BY_CHAPTERS:
      return "/api/v1/general/split-pdf-by-chapters";
    case SPLIT_METHODS.BY_PAGE_DIVIDER:
      return "/api/v1/misc/auto-split-pdf";
    default:
      throw new Error(`Unknown split method: ${parameters.method}`);
  }
};

// Static configuration object
export const splitOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSplitFormData,
  operationType: 'splitPdf',
  endpoint: getSplitEndpoint,
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
