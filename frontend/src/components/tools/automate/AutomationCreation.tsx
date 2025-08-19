import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Text,
  Title,
  Stack,
  Group,
  TextInput,
  ActionIcon,
  Divider
} from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { ToolRegistryEntry } from '../../../data/toolsTaxonomy';
import ToolConfigurationModal from './ToolConfigurationModal';
import ToolSelector from './ToolSelector';

interface AutomationCreationProps {
  mode: 'custom' | 'suggested' | 'create';
  existingAutomation?: any;
  onBack: () => void;
  onComplete: (automation: any) => void;
  toolRegistry: Record<string, ToolRegistryEntry>; // Pass registry as prop to break circular dependency
}

interface AutomationTool {
  id: string;
  operation: string;
  name: string;
  configured: boolean;
  parameters?: any;
}

export default function AutomationCreation({ mode, existingAutomation, onBack, onComplete, toolRegistry }: AutomationCreationProps) {
  const { t } = useTranslation();

  const [automationName, setAutomationName] = useState('');
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configuraingToolIndex, setConfiguringToolIndex] = useState(-1);

  // Initialize based on mode and existing automation
  useEffect(() => {
    if (mode === 'suggested' && existingAutomation) {
      setAutomationName(existingAutomation.name);

      const tools = existingAutomation.operations.map((op: string) => ({
        id: `${op}-${Date.now()}`,
        operation: op,
        name: getToolName(op),
        configured: false,
        parameters: {}
      }));

      setSelectedTools(tools);
    }
  }, [mode, existingAutomation]);

  const getToolName = (operation: string) => {
    const tool = toolRegistry?.[operation] as any;
    return tool?.name || t(`tools.${operation}.name`, operation);
  };

  const addTool = (operation: string) => {

    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      configured: false,
      parameters: {}
    };

    setSelectedTools([...selectedTools, newTool]);
  };

  const removeTool = (index: number) => {
    setSelectedTools(selectedTools.filter((_, i) => i !== index));
  };

  const configureTool = (index: number) => {
    setConfiguringToolIndex(index);
    setConfigModalOpen(true);
  };

  const handleToolConfigSave = (parameters: any) => {
    if (configuraingToolIndex >= 0) {
      const updatedTools = [...selectedTools];
      updatedTools[configuraingToolIndex] = {
        ...updatedTools[configuraingToolIndex],
        configured: true,
        parameters
      };
      setSelectedTools(updatedTools);
    }
    setConfigModalOpen(false);
    setConfiguringToolIndex(-1);
  };

  const handleToolConfigCancel = () => {
    setConfigModalOpen(false);
    setConfiguringToolIndex(-1);
  };

  const canSaveAutomation = () => {
    return (
      automationName.trim() !== '' &&
      selectedTools.length > 0 &&
      selectedTools.every(tool => tool.configured)
    );
  };

  const saveAutomation = async () => {
    if (!canSaveAutomation()) return;

    const automation = {
      name: automationName.trim(),
      description: '',
      operations: selectedTools.map(tool => ({
        operation: tool.operation,
        parameters: tool.parameters
      }))
    };

    try {
      const { automationStorage } = await import('../../../services/automationStorage');
      await automationStorage.saveAutomation(automation);
      onComplete(automation);
    } catch (error) {
      console.error('Error saving automation:', error);
    }
  };

  const currentConfigTool = configuraingToolIndex >= 0 ? selectedTools[configuraingToolIndex] : null;

  return (
    <div>
        <Text size="sm" mb="md" p="md"  style={{borderRadius:'var(--mantine-radius-md)', background: 'var(--color-gray-200)', color: 'var(--mantine-color-text)' }}>
        {t("automate.creation.description", "Automations run tools sequentially. To get started, add tools in the order you want them to run.")}
        </Text>
      <Divider mb="md" />

      <Stack gap="md">
        {/* Automation Name */}
        <TextInput
          placeholder={t('automate.creation.name.placeholder', 'Automation name')}
          value={automationName}
          onChange={(e) => setAutomationName(e.currentTarget.value)}
          size="sm"
        />

        {/* Add Tool Selector */}
        <ToolSelector
          onSelect={addTool}
          excludeTools={['automate']}
          toolRegistry={toolRegistry}
        />

        {/* Selected Tools */}
        {selectedTools.length > 0 && (
          <Stack gap="xs">
            {selectedTools.map((tool, index) => (
              <Group key={tool.id} gap="xs" align="center">
                <Text size="xs" c="dimmed" style={{ minWidth: '1rem', textAlign: 'center' }}>
                  {index + 1}
                </Text>

                <div style={{ flex: 1 }}>
                  <Group justify="space-between" align="center">
                    <Group gap="xs" align="center">
                      <Text size="sm" style={{ color: 'var(--mantine-color-text)' }}>
                        {tool.name}
                      </Text>
                      {tool.configured ? (
                        <CheckIcon style={{ fontSize: 14, color: 'green' }} />
                      ) : (
                        <CloseIcon style={{ fontSize: 14, color: 'orange' }} />
                      )}
                    </Group>

                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => configureTool(index)}
                      >
                        <SettingsIcon style={{ fontSize: 16 }} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="red"
                        onClick={() => removeTool(index)}
                      >
                        <DeleteIcon style={{ fontSize: 16 }} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </div>

                {index < selectedTools.length - 1 && (
                  <Text size="xs" c="dimmed">→</Text>
                )}
              </Group>
            ))}
          </Stack>
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
        />
      )}
    </div>
  );
}
