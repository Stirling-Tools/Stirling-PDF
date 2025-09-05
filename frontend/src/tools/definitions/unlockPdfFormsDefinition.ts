import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { UnlockPdfFormsParameters, useUnlockPdfFormsParameters } from '../../hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters';
import { useUnlockPdfFormsOperation } from '../../hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation';

export const unlockPdfFormsDefinition: ToolDefinition<UnlockPdfFormsParameters> = {
  id: 'unlockPdfForms',

  useParameters: useUnlockPdfFormsParameters,
  useOperation: useUnlockPdfFormsOperation,

  steps: [],

  executeButton: {
    text: (t) => t("unlockPDFForms.submit", "Unlock Forms"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("unlockPDFForms.results.title", "Unlocked Forms Results"),
  },
};
