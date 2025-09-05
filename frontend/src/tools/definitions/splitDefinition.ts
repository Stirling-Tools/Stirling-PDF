import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { SplitParameters, useSplitParameters } from '../../hooks/tools/split/useSplitParameters';
import { useSplitOperation } from '../../hooks/tools/split/useSplitOperation';
import SplitSettings from '../../components/tools/split/SplitSettings';

export const splitDefinition: ToolDefinition<SplitParameters> = {
  id: 'split',

  useParameters: useSplitParameters,
  useOperation: useSplitOperation,

  steps: [
    {
      key: 'settings',
      title: (t) => t("split.settings.title", "Settings"),
      component: SplitSettings,
    },
  ],

  executeButton: {
    text: (t) => t("split.submit", "Split PDF"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("split.results.title", "Split Results"),
  },
};
