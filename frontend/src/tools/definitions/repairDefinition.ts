import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { RepairParameters, useRepairParameters } from '../../hooks/tools/repair/useRepairParameters';
import { useRepairOperation } from '../../hooks/tools/repair/useRepairOperation';
import RepairSettings from '../../components/tools/repair/RepairSettings';

export const repairDefinition: ToolDefinition<RepairParameters> = {
  id: 'repair',

  useParameters: useRepairParameters,
  useOperation: useRepairOperation,

  steps: [
    {
      key: 'settings',
      title: (t) => t("repair.settings.title", "Settings"),
      component: RepairSettings,
    },
  ],

  executeButton: {
    text: (t) => t("repair.submit", "Repair PDF"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("repair.results.title", "Repair Results"),
  },
};
