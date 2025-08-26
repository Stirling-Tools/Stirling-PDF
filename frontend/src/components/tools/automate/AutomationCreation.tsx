import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Text,
  Stack,
  Group,
  TextInput,
  Textarea,
  Divider,
  Modal
} from '@mantine/core';
import CheckIcon from '@mui/icons-material/Check';
import { ToolRegistryEntry } from '../../../data/toolsTaxonomy';
import ToolConfigurationModal from './ToolConfigurationModal';
import ToolList from './ToolList';
import IconSelector from './IconSelector';
import { AutomationConfig, AutomationMode, AutomationTool } from '../../../types/automation';
import { useAutomationForm } from '../../../hooks/tools/automate/useAutomationForm';


interface AutomationCreationProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  onBack: () => void;
  onComplete: (automation: AutomationConfig) => void;
  toolRegistry: Record<string, ToolRegistryEntry>;
}

export default function AutomationCreation({ mode, existingAutomation, onBack, onComplete, toolRegistry }: AutomationCreationProps) {
  const { t } = useTranslation();

  const {
    automationName,
    setAutomationName,
    automationDescription,
    setAutomationDescription,
    automationIcon,
    setAutomationIcon,
    selectedTools,
    addTool,
    removeTool,
    updateTool,
    hasUnsavedChanges,
    canSaveAutomation,
    getToolName,
    getToolDefaultParameters
  } = useAutomationForm({ mode, existingAutomation, toolRegistry });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configuraingToolIndex, setConfiguringToolIndex] = useState(-1);
  const [unsavedWarningOpen, setUnsavedWarningOpen] = useState(false);


  const configureTool = (index: number) => {
    setConfiguringToolIndex(index);
    setConfigModalOpen(true);
  };

  const handleToolConfigSave = (parameters: Record<string, any>) => {
    if (configuraingToolIndex >= 0) {
      updateTool(configuraingToolIndex, {
        configured: true,
        parameters
      });
    }
    setConfigModalOpen(false);
    setConfiguringToolIndex(-1);
  };

  const handleToolConfigCancel = () => {
    setConfigModalOpen(false);
    setConfiguringToolIndex(-1);
  };

  const handleToolAdd = () => {
    const newTool: AutomationTool = {
      id: `tool-${Date.now()}`,
      operation: '',
      name: t('automate.creation.tools.selectTool', 'Select a tool...'),
      configured: false,
      parameters: {}
    };
    updateTool(selectedTools.length, newTool);
  };

  const handleBackClick = () => {
    if (hasUnsavedChanges()) {
      setUnsavedWarningOpen(true);
    } else {
      onBack();
    }
  };

  const handleConfirmBack = () => {
    setUnsavedWarningOpen(false);
    onBack();
  };

  const handleCancelBack = () => {
    setUnsavedWarningOpen(false);
  };

  const saveAutomation = async () => {
    if (!canSaveAutomation()) return;

    const automationData = {
      name: automationName.trim(),
      description: automationDescription.trim(),
      icon: automationIcon,
      operations: selectedTools.map(tool => ({
        operation: tool.operation,
        parameters: tool.parameters || {}
      }))
    };

    try {
      const { automationStorage } = await import('../../../services/automationStorage');
      let savedAutomation;

      if (mode === AutomationMode.EDIT && existingAutomation) {
        // For edit mode, check if name has changed
        const nameChanged = automationName.trim() !== existingAutomation.name;

        if (nameChanged) {
          // Name changed - create new automation
          savedAutomation = await automationStorage.saveAutomation(automationData);
        } else {
          // Name unchanged - update existing automation
          const updatedAutomation = {
            ...existingAutomation,
            ...automationData,
            id: existingAutomation.id,
            createdAt: existingAutomation.createdAt
          };
          savedAutomation = await automationStorage.updateAutomation(updatedAutomation);
        }
      } else {
        // Create mode - always create new automation
        savedAutomation = await automationStorage.saveAutomation(automationData);
      }

      onComplete(savedAutomation);
    } catch (error) {
      console.error('Error saving automation:', error);
    }
  };

  const currentConfigTool = configuraingToolIndex >= 0 ? selectedTools[configuraingToolIndex] : null;

  return (
    <div>
        <Text size="sm" mb="md" p="md"  style={{borderRadius:'var(--mantine-radius-md)', background: 'var(--color-gray-200)', color: 'var(--mantine-color-text)' }}>
            {t("automate.creation.intro", "Automations run tools sequentially. To get started, add tools in the order you want them to run.")}
        </Text>
      <Divider mb="md" />

      <Stack gap="md">
        {/* Automation Name and Icon */}
        <Group gap="xs" align="flex-end">
          <Stack gap="xs" style={{ flex: 1 }}>
            <TextInput
              placeholder={t('automate.creation.name.placeholder', 'My Automation')}
              value={automationName}
              withAsterisk
              label={t('automate.creation.name.label', 'Automation Name')}
              onChange={(e) => setAutomationName(e.currentTarget.value)}
              size="sm"
            />
          </Stack>

          <IconSelector
            value={automationIcon || 'SettingsIcon'}
            onChange={setAutomationIcon}
            size="sm"
          />
        </Group>

        {/* Automation Description */}
        <Textarea
          placeholder={t('automate.creation.description.placeholder', 'Describe what this automation does...')}
          value={automationDescription}
          label={t('automate.creation.description.label', 'Description')}
          onChange={(e) => setAutomationDescription(e.currentTarget.value)}
          size="sm"
          rows={3}
        />


        {/* Selected Tools List */}
        {selectedTools.length > 0 && (
          <ToolList
            tools={selectedTools}
            toolRegistry={toolRegistry}
            onToolUpdate={updateTool}
            onToolRemove={removeTool}
            onToolConfigure={configureTool}
            onToolAdd={handleToolAdd}
            getToolName={getToolName}
            getToolDefaultParameters={getToolDefaultParameters}
          />
        )}

        <Divider />

        {/* Save Button */}
        <Button
          leftSection={<CheckIcon />}
          onClick={saveAutomation}
          disabled={!canSaveAutomation()}
          fullWidth
        >
          {t('automate.creation.save', 'Save Automation')}
        </Button>
      </Stack>

      {/* Tool Configuration Modal */}
      {currentConfigTool && (
        <ToolConfigurationModal
          opened={configModalOpen}
          tool={currentConfigTool}
          onSave={handleToolConfigSave}
          onCancel={handleToolConfigCancel}
          toolRegistry={toolRegistry}
        />
      )}

      {/* Unsaved Changes Warning Modal */}
      <Modal
        opened={unsavedWarningOpen}
        onClose={handleCancelBack}
        title={t('automate.creation.unsavedChanges.title', 'Unsaved Changes')}
        centered
      >
        <Stack gap="md">
          <Text>
            {t('automate.creation.unsavedChanges.message', 'You have unsaved changes. Are you sure you want to go back? All changes will be lost.')}
          </Text>
          <Group gap="md" justify="flex-end">
            <Button variant="outline" onClick={handleCancelBack}>
              {t('automate.creation.unsavedChanges.cancel', 'Cancel')}
            </Button>
            <Button color="red" onClick={handleConfirmBack}>
              {t('automate.creation.unsavedChanges.confirm', 'Go Back')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
