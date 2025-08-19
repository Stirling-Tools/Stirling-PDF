import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Button, 
  Card, 
  Text, 
  Title, 
  Stack, 
  Group, 
  Select, 
  TextInput, 
  Textarea,
  Badge,
  ActionIcon,
  Modal,
  Box
} from '@mantine/core';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useToolWorkflow } from '../../../contexts/ToolWorkflowContext';
import ToolConfigurationModal from './ToolConfigurationModal';

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
  const [automationDescription, setAutomationDescription] = useState('');
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configuraingToolIndex, setConfiguringToolIndex] = useState(-1);

  // Initialize based on mode and existing automation
  useEffect(() => {
    if (mode === 'suggested' && existingAutomation) {
      setAutomationName(existingAutomation.name);
      setAutomationDescription(existingAutomation.description || '');
      
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
      .filter(([key]) => key !== 'automate') // Don't allow recursive automations
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
      description: automationDescription.trim(),
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
      // TODO: Show error notification to user
    }
  };

  const currentConfigTool = configuraingToolIndex >= 0 ? selectedTools[configuraingToolIndex] : null;

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <div>
          <Title order={2} mb="xs">
            {mode === 'create' 
              ? t('automate.creation.title.create', 'Create New Automation')
              : mode === 'suggested'
                ? t('automate.creation.title.configure', 'Configure Automation')
                : t('automate.creation.title.edit', 'Edit Automation')
            }
          </Title>
          <Text size="sm" c="dimmed">
            {t('automate.creation.description', 'Add and configure tools to create your workflow')}
          </Text>
        </div>
        <Button
          leftSection={<ArrowBackIcon />}
          variant="light"
          onClick={onBack}
        >
          {t('automate.creation.back', 'Back')}
        </Button>
      </Group>

      {/* Automation Details */}
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Stack gap="md">
          <TextInput
            label={t('automate.creation.name.label', 'Automation Name')}
            placeholder={t('automate.creation.name.placeholder', 'Enter a name for this automation')}
            value={automationName}
            onChange={(e) => setAutomationName(e.currentTarget.value)}
            required
          />
          <Textarea
            label={t('automate.creation.description.label', 'Description')}
            placeholder={t('automate.creation.description.placeholder', 'Optional description of what this automation does')}
            value={automationDescription}
            onChange={(e) => setAutomationDescription(e.currentTarget.value)}
            minRows={2}
          />
        </Stack>
      </Card>

      {/* Tool Selection */}
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <Text fw={600}>
            {t('automate.creation.tools.title', 'Tools in Workflow')}
          </Text>
          <Select
            placeholder={t('automate.creation.tools.add', 'Add a tool...')}
            data={getAvailableTools()}
            searchable
            clearable
            value={null}
            onChange={addTool}
            leftSection={<AddIcon />}
          />
        </Group>

        {selectedTools.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            {t('automate.creation.tools.empty', 'No tools added yet. Select a tool from the dropdown above.')}
          </Text>
        ) : (
          <Stack gap="sm">
            {selectedTools.map((tool, index) => (
              <Box key={tool.id}>
                <Group gap="sm" align="center">
                  <Badge size="sm" variant="light">
                    {index + 1}
                  </Badge>
                  <Card 
                    shadow="xs" 
                    padding="sm" 
                    radius="sm" 
                    withBorder 
                    style={{ flex: 1 }}
                  >
                    <Group justify="space-between" align="center">
                      <div>
                        <Group gap="xs" align="center">
                          <Text fw={500}>{tool.name}</Text>
                          {tool.configured ? (
                            <Badge size="xs" color="green" leftSection={<CheckIcon style={{ fontSize: 10 }} />}>
                              {t('automate.creation.tools.configured', 'Configured')}
                            </Badge>
                          ) : (
                            <Badge size="xs" color="orange" leftSection={<CloseIcon style={{ fontSize: 10 }} />}>
                              {t('automate.creation.tools.needsConfig', 'Needs Configuration')}
                            </Badge>
                          )}
                        </Group>
                      </div>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          onClick={() => configureTool(index)}
                          title={t('automate.creation.tools.configure', 'Configure')}
                        >
                          <SettingsIcon />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => removeTool(index)}
                          title={t('automate.creation.tools.remove', 'Remove')}
                        >
                          <DeleteIcon />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Card>
                  {index < selectedTools.length - 1 && (
                    <ArrowForwardIcon style={{ color: 'var(--mantine-color-dimmed)' }} />
                  )}
                </Group>
              </Box>
            ))}
          </Stack>
        )}
      </Card>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button
          leftSection={<CheckIcon />}
          onClick={saveAutomation}
          disabled={!canSaveAutomation()}
        >
          {t('automate.creation.save', 'Save Automation')}
        </Button>
      </Group>

      {/* Tool Configuration Modal */}
      {currentConfigTool && (
        <ToolConfigurationModal
          opened={configModalOpen}
          tool={currentConfigTool}
          onSave={handleToolConfigSave}
          onCancel={handleToolConfigCancel}
        />
      )}
    </Stack>
  );
}