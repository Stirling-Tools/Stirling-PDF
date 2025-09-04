import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { ChangePermissionsParameters, useChangePermissionsParameters } from '../../hooks/tools/changePermissions/useChangePermissionsParameters';
import { useChangePermissionsOperation } from '../../hooks/tools/changePermissions/useChangePermissionsOperation';
import ChangePermissionsSettings from '../../components/tools/changePermissions/ChangePermissionsSettings';

export const changePermissionsDefinition: ToolDefinition<ChangePermissionsParameters> = {
  id: 'changePermissions',

  useParameters: useChangePermissionsParameters,
  useOperation: useChangePermissionsOperation,

  steps: [
    {
      key: 'settings',
      title: (t) => t("changePermissions.title", "Document Permissions"),
      component: ChangePermissionsSettings,
      tooltip: (t) => ({
        header: {
          title: t("changePermissions.tooltip.header.title", "Change Permissions")
        },
        tips: [
          {
            description: t("changePermissions.tooltip.description.text", "Changes document permissions, allowing/disallowing access to different features in PDF readers.")
          },
          {
            title: t("warning.tooltipTitle", "Warning"),
            description: t("changePermissions.tooltip.warning.text", "To make these permissions unchangeable, use the Add Password tool to set an owner password.")
          }
        ]
      }),
    },
  ],

  executeButton: {
    text: (t) => t("changePermissions.submit", "Change Permissions"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("changePermissions.results.title", "Modified PDFs"),
  },
};
