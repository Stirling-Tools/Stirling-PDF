import React from "react";
import { useTranslation } from "react-i18next";
import { Title, Stack, Divider } from "@mantine/core";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import AutomationEntry from "./AutomationEntry";
import { useSuggestedAutomations } from "../../../hooks/tools/automate/useSuggestedAutomations";
import { useSavedAutomations } from "../../../hooks/tools/automate/useSavedAutomations";

interface AutomationSelectionProps {
  onSelectCustom: () => void;
  onSelectSuggested: (automation: any) => void;
  onCreateNew: () => void;
}

export default function AutomationSelection({ onSelectCustom, onSelectSuggested, onCreateNew }: AutomationSelectionProps) {
  const { t } = useTranslation();
  const { savedAutomations } = useSavedAutomations();
  const suggestedAutomations = useSuggestedAutomations();

  return (
    <div>
      <Title order={3} size="h4" mb="md">
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
          operations={automation.operations.map(op => typeof op === 'string' ? op : op.operation)}
          onClick={() => onSelectCustom()}
        />
      ))}
      <Divider />

      {/* Suggested Automations */}
      <div>
        <Title order={3} size="h4" mb="md">
          {t("automate.selection.suggested.title", "Suggested")}
        </Title>
        <Stack gap="xs">
          {suggestedAutomations.map((automation) => (
            <AutomationEntry
              key={automation.id}
              badgeIcon={automation.icon}
              operations={automation.operations}
              onClick={() => onSelectSuggested(automation)}
            />
          ))}
        </Stack>
      </div>
    </Stack>
    </div>
  );
}
