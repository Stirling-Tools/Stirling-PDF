import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SplitParameters } from '../../../components/tools/split/SplitSettings';
import { SPLIT_MODES } from '../../../constants/splitConstants';


const buildFormData = (parameters: SplitParameters, selectedFiles: File[]): FormData => {
  const formData = new FormData();
  
  selectedFiles.forEach(file => {
    formData.append("fileInput", file);
  });

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

const getEndpoint = (parameters: SplitParameters): string => {
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

export const useSplitOperation = () => {
  const { t } = useTranslation();
  
  return useToolOperation<SplitParameters>({
    operationType: 'split',
    endpoint: (params) => getEndpoint(params),
    buildFormData: buildFormData, // Multi-file signature: (params, selectedFiles) => FormData  
    filePrefix: 'split_',
    multiFileEndpoint: true, // Single API call with all files
    responseHandler: {
      type: 'zip',
      useZipExtractor: true
    },
    validateParams: (params) => {
      if (!params.mode) {
        return { valid: false, errors: [t('split.validation.modeRequired', 'Split mode is required')] };
      }
      
      if (params.mode === SPLIT_MODES.BY_PAGES && !params.pages) {
        return { valid: false, errors: [t('split.validation.pagesRequired', 'Page numbers are required for split by pages')] };
      }
      
      return { valid: true };
    },
    getErrorMessage: createStandardErrorHandler(t('split.error.failed', 'An error occurred while splitting the PDF.'))
  });
};