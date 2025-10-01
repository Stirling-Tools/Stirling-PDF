import { useTranslation } from "react-i18next";
import { Title, Stack, Divider } from "@mantine/core";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import AutomationEntry from "./AutomationEntry";
import { useSuggestedAutomations } from "../../../hooks/tools/automate/useSuggestedAutomations";
import { AutomationConfig, SuggestedAutomation } from "../../../types/automation";
import { iconMap } from './iconMap';
import { ToolRegistryEntry } from '../../../data/toolsTaxonomy';

interface AutomationSelectionProps {
  savedAutomations: AutomationConfig[];
  onCreateNew: () => void;
  onRun: (automation: AutomationConfig) => void;
  onEdit: (automation: AutomationConfig) => void;
  onDelete: (automation: AutomationConfig) => void;
  onCopyFromSuggested: (automation: SuggestedAutomation) => void;
  toolRegistry: Record<string, ToolRegistryEntry>;
}

export default function AutomationSelection({
  savedAutomations,
  onCreateNew,
  onRun,
  onEdit,
  onDelete,
  onCopyFromSuggested,
  toolRegistry
}: AutomationSelectionProps) {
  const { t } = useTranslation();
  const suggestedAutomations = useSuggestedAutomations();

  return (
    <div>
      <Title order={3} size="h4" fw={600} mb="md" style={{color: 'var(--mantine-color-dimmed)'}}>
        {t("automate.selection.saved.title", "Saved")}
      </Title>

    <Stack gap="xs">
      <AutomationEntry
        title={t("automate.selection.createNew.title", "Create New Automation")}
        badgeIcon={AddCircleOutline}
        operations={[]}
        onClick={onCreateNew}
        keepIconColor={true}
        toolRegistry={toolRegistry}
      />
      {/* Saved Automations */}
      {savedAutomations.map((automation) => {
        const IconComponent = automation.icon ? iconMap[automation.icon as keyof typeof iconMap] : SettingsIcon;
        return (
          <AutomationEntry
            key={automation.id}
            title={automation.name}
            description={automation.description}
            badgeIcon={IconComponent || SettingsIcon}
            operations={automation.operations.map(op => typeof op === 'string' ? op : op.operation)}
            onClick={() => onRun(automation)}
            showMenu={true}
            onEdit={() => onEdit(automation)}
            onDelete={() => onDelete(automation)}
            toolRegistry={toolRegistry}
          />
        );
      })}
      <Divider pb='sm' />

      {/* Suggested Automations */}
      <div>
        <Title order={3} size="h4" fw={600} mb="md"style={ {color: 'var(--mantine-color-dimmed)'}}>
          {t("automate.selection.suggested.title", "Suggested")}
        </Title>
        <Stack gap="xs">
          {suggestedAutomations.map((automation) => (
            <AutomationEntry
              key={automation.id}
              title={automation.name}
              description={automation.description}
              badgeIcon={automation.icon}
              operations={automation.operations.map(op => op.operation)}
              onClick={() => onRun(automation)}
              showMenu={true}
              onCopy={() => onCopyFromSuggested(automation)}
              toolRegistry={toolRegistry}
            />
          ))}
        </Stack>
      </div>
    </Stack>
    </div>
  );
}
