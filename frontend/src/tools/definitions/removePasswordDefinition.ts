import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { RemovePasswordParameters, useRemovePasswordParameters } from '../../hooks/tools/removePassword/useRemovePasswordParameters';
import { useRemovePasswordOperation } from '../../hooks/tools/removePassword/useRemovePasswordOperation';
import RemovePasswordSettings from '../../components/tools/removePassword/RemovePasswordSettings';

export const removePasswordDefinition: ToolDefinition<RemovePasswordParameters> = {
  id: 'removePassword',

  useParameters: useRemovePasswordParameters,
  useOperation: useRemovePasswordOperation,

  steps: [
    {
      key: 'settings',
      title: (t) => t("removePassword.password.stepTitle", "Remove Password"),
      component: RemovePasswordSettings,
      tooltip: (t) => ({
        header: {
          title: t("removePassword.title", "Remove Password")
        },
        tips: [
          {
            description: t(
              "removePassword.tooltip.description",
              "Removing password protection requires the current password that was used to encrypt the PDF. This will decrypt the document, making it accessible without a password."
            )
          }
        ]
      }),
    },
  ],

  executeButton: {
    text: (t) => t("removePassword.submit", "Remove Password"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("removePassword.results.title", "Decrypted PDFs"),
  },
};
