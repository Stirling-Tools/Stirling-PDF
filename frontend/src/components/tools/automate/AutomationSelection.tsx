import React from "react";
import { useTranslation } from "react-i18next";
import { Title, Stack, Divider } from "@mantine/core";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import AutomationEntry from "./AutomationEntry";
import { useSuggestedAutomations } from "../../../hooks/tools/automate/useSuggestedAutomations";

interface AutomationSelectionProps {
  savedAutomations: any[];
  onCreateNew: () => void;
  onRun: (automation: any) => void;
  onEdit: (automation: any) => void;
  onDelete: (automation: any) => void;
}

export default function AutomationSelection({ 
  savedAutomations,
  onCreateNew, 
  onRun, 
  onEdit, 
  onDelete 
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
      />
      {/* Saved Automations */}
      {savedAutomations.map((automation) => (
        <AutomationEntry
          key={automation.id}
          title={automation.name}
          badgeIcon={SettingsIcon}
          operations={automation.operations.map((op: any) => typeof op === 'string' ? op : op.operation)}
          onClick={() => onRun(automation)}
          showMenu={true}
          onEdit={() => onEdit(automation)}
          onDelete={() => onDelete(automation)}
        />
      ))}
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
              badgeIcon={automation.icon}
              operations={automation.operations}
              onClick={() => onRun(automation)}
            />
          ))}
        </Stack>
      </div>
    </Stack>
    </div>
  );
}
