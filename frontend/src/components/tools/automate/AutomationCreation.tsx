import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Button, 
  Text, 
  Title, 
  Stack, 
  Group, 
  Select, 
  TextInput, 
  ActionIcon,
  Divider
} from '@mantine/core';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useToolWorkflow } from '../../../contexts/ToolWorkflowContext';
import ToolConfigurationModal from './ToolConfigurationModal';
import AutomationEntry from './AutomationEntry';

interface AutomationCreationProps {
  mode: 'custom' | 'suggested' | 'create';
  existingAutomation?: any;
  onBack: () => void;
  onComplete: () => void;
}

interface AutomationTool {
  id: string;
  operation: string;
  name: string;
  configured: boolean;
  parameters?: any;
}

export default function AutomationCreation({ mode, existingAutomation, onBack, onComplete }: AutomationCreationProps) {
  const { t } = useTranslation();
  const { toolRegistry } = useToolWorkflow();
  
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

  const getAvailableTools = () => {
    if (!toolRegistry) return [];
    
    return Object.entries(toolRegistry)
      .filter(([key]) => key !== 'automate')
      .map(([key, tool]) => ({
        value: key,
        label: (tool as any).name
      }));
  };

  const addTool = (operation: string | null) => {
    if (!operation) return;
    
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
      onComplete();
    } catch (error) {
      console.error('Error saving automation:', error);
    }
  };

  const currentConfigTool = configuraingToolIndex >= 0 ? selectedTools[configuraingToolIndex] : null;

  return (
    <div>
      <Group justify="space-between" align="center" mb="md">
        <Title order={3} size="h4" fw={600} style={{ color: 'var(--mantine-color-text)' }}>
          {mode === 'create' 
            ? t('automate.creation.title.create', 'Create Automation')
            : t('automate.creation.title.configure', 'Configure Automation')
          }
        </Title>
        <ActionIcon variant="subtle" onClick={onBack}>
          <ArrowBackIcon />
        </ActionIcon>
      </Group>

      <Stack gap="md">
        {/* Automation Name */}
        <TextInput
          placeholder={t('automate.creation.name.placeholder', 'Automation name')}
          value={automationName}
          onChange={(e) => setAutomationName(e.currentTarget.value)}
          size="sm"
        />

        {/* Add Tool Selector */}
        <Select
          placeholder={t('automate.creation.tools.add', 'Add a tool...')}
          data={getAvailableTools()}
          searchable
          clearable
          value={null}
          onChange={addTool}
          leftSection={<AddIcon />}
          size="sm"
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