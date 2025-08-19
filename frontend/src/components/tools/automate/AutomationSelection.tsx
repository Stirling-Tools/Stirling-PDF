import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Text, Title, Stack, Group, Badge, Divider } from "@mantine/core";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import StarIcon from "@mui/icons-material/Star";

interface AutomationSelectionProps {
  onSelectCustom: () => void;
  onSelectSuggested: (automation: any) => void;
  onCreateNew: () => void;
}

interface SavedAutomation {
  id: string;
  name: string;
  description?: string;
  operations: any[];
  createdAt: string;
}

export default function AutomationSelection({ onSelectCustom, onSelectSuggested, onCreateNew }: AutomationSelectionProps) {
  const { t } = useTranslation();
  const [savedAutomations, setSavedAutomations] = useState<SavedAutomation[]>([]);

  // Load saved automations from IndexedDB
  useEffect(() => {
    loadSavedAutomations();
  }, []);

  const loadSavedAutomations = async () => {
    try {
      const { automationStorage } = await import("../../../services/automationStorage");
      const automations = await automationStorage.getAllAutomations();
      setSavedAutomations(automations);
    } catch (error) {
      console.error("Error loading saved automations:", error);
      setSavedAutomations([]);
    }
  };

  // Suggested automations - these are pre-defined common workflows
  const suggestedAutomations = [
    {
      id: "compress-and-merge",
      name: t("automate.suggested.compressAndMerge.name", "Compress & Merge"),
      description: t("automate.suggested.compressAndMerge.description", "Compress multiple PDFs then merge them into one"),
      operations: ["compress", "merge"],
      icon: <StarIcon />,
    },
    {
      id: "ocr-and-convert",
      name: t("automate.suggested.ocrAndConvert.name", "OCR & Convert"),
      description: t("automate.suggested.ocrAndConvert.description", "Apply OCR to PDFs then convert to different format"),
      operations: ["ocr", "convert"],
      icon: <StarIcon />,
    },
    {
      id: "secure-workflow",
      name: t("automate.suggested.secureWorkflow.name", "Secure Workflow"),
      description: t("automate.suggested.secureWorkflow.description", "Sanitize, add password, and set permissions"),
      operations: ["sanitize", "addPassword", "changePermissions"],
      icon: <StarIcon />,
    },
  ];

  return (
    <Stack gap="xl">
      {/* Create New Automation */}
      <Title order={3} size="h4" mb="md">
        {t("automate.selection.saved.title", "Saved")}
      </Title>
      <Button variant="subtle" onClick={onCreateNew}>
        <Group gap="md" align="center">
          <AddIcon color="primary" />
          <Text fw={600}>{t("automate.selection.createNew.title", "Create New Automation")}</Text>
        </Group>
      </Button>

      {savedAutomations.map((automation) => (
        <Button variant="subtle" fullWidth={true} onClick={() => onSelectCustom()}>
          <div style={{ flex: 1 }}>
            <Group gap="xs">
              {automation.operations.map((op: any, index: number) => (
                <React.Fragment key={`${op.operation || op}-${index}`}>
                  <Badge size="xs" variant="outline">
                    {String(t(`tools.${op.operation || op}.name`, op.operation || op))}
                  </Badge>
                  {index < automation.operations.length - 1 && (
                    <Text size="xs" c="dimmed">
                      →
                    </Text>
                  )}
                </React.Fragment>
              ))}
            </Group>
          </div>
        </Button>
      ))}
      <Divider />

      {/* Suggested Automations */}
      <div>
        <Title order={3} size="h4" mb="md">
          {t("automate.selection.suggested.title", "Suggested")}
        </Title>
        <Stack gap="md">
          {suggestedAutomations.map((automation) => (
            <Button
              size="md"
              variant="subtle"
              fullWidth={true}
              onClick={() => onSelectSuggested(automation)}
              style={{ paddingLeft: "0" }}
            >
              <Group gap="xs">
                {automation.operations.map((op, index) => (
                  <React.Fragment key={op}>
                    {t(`${op}.title`, op)}
                    {index < automation.operations.length - 1 && (
                      <Text size="xs" c="dimmed">
                        →
                      </Text>
                    )}
                  </React.Fragment>
                ))}
              </Group>
            </Button>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}
