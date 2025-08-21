import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SplitParameters } from './useSplitParameters';
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
    toolType: 'multiFile',
    buildFormData,
    operationType: 'split',
    endpoint: (params) => getEndpoint(params),
    filePrefix: 'split_',
    getErrorMessage: createStandardErrorHandler(t('split.error.failed', 'An error occurred while splitting the PDF.'))
  });
};
