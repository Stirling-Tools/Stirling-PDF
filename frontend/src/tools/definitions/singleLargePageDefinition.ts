import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { SingleLargePageParameters, useSingleLargePageParameters } from '../../hooks/tools/singleLargePage/useSingleLargePageParameters';
import { useSingleLargePageOperation } from '../../hooks/tools/singleLargePage/useSingleLargePageOperation';

export const singleLargePageDefinition: ToolDefinition<SingleLargePageParameters> = {
  id: 'singleLargePage',

  useParameters: useSingleLargePageParameters,
  useOperation: useSingleLargePageOperation,

  steps: [],

  executeButton: {
    text: (t) => t("pdfToSinglePage.submit", "Convert To Single Page"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("pdfToSinglePage.results.title", "Single Page Results"),
  },
};
