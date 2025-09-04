import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { SanitizeParameters, useSanitizeParameters } from '../../hooks/tools/sanitize/useSanitizeParameters';
import { useSanitizeOperation } from '../../hooks/tools/sanitize/useSanitizeOperation';
import SanitizeSettings from '../../components/tools/sanitize/SanitizeSettings';

export const sanitizeDefinition: ToolDefinition<SanitizeParameters> = {
  id: 'sanitize',

  useParameters: useSanitizeParameters,
  useOperation: useSanitizeOperation,

  steps: [
    {
      key: 'settings',
      title: (t) => t("sanitize.steps.settings", "Settings"),
      component: SanitizeSettings,
    },
  ],

  executeButton: {
    text: (t) => t("sanitize.submit", "Sanitize PDF"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("sanitize.sanitizationResults", "Sanitization Results"),
  },
};
