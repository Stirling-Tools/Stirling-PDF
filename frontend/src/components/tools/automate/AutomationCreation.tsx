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
  Divider,
  Modal
} from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutline from '@mui/icons-material/AddCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ToolRegistryEntry } from '../../../data/toolsTaxonomy';
import ToolConfigurationModal from './ToolConfigurationModal';
import ToolSelector from './ToolSelector';
import AutomationEntry from './AutomationEntry';

export enum AutomationMode {
  CREATE = 'create',
  EDIT = 'edit',
  SUGGESTED = 'suggested'
}

interface AutomationCreationProps {
  mode: AutomationMode;
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
  const [unsavedWarningOpen, setUnsavedWarningOpen] = useState(false);

  // Initialize based on mode and existing automation
  useEffect(() => {
    if ((mode === AutomationMode.SUGGESTED || mode === AutomationMode.EDIT) && existingAutomation) {
      setAutomationName(existingAutomation.name || '');

      // Handle both string array (suggested) and object array (custom) operations
      const operations = existingAutomation.operations || [];
      const tools = operations.map((op: any, index: number) => {
        const operation = typeof op === 'string' ? op : op.operation;
        return {
          id: `${operation}-${Date.now()}-${index}`,
          operation: operation,
          name: getToolName(operation),
          configured: mode === AutomationMode.EDIT ? true : (typeof op === 'object' ? op.configured || false : false),
          parameters: typeof op === 'object' ? op.parameters || {} : {}
        };
      });

      setSelectedTools(tools);
    } else if (mode === AutomationMode.CREATE && selectedTools.length === 0) {
      // Initialize with 2 empty tools for new automation
      const defaultTools = [
        {
          id: `tool-1-${Date.now()}`,
          operation: '',
          name: t('automate.creation.tools.selectTool', 'Select a tool...'),
          configured: false,
          parameters: {}
        },
        {
          id: `tool-2-${Date.now() + 1}`,
          operation: '',
          name: t('automate.creation.tools.selectTool', 'Select a tool...'),
          configured: false,
          parameters: {}
        }
      ];
      setSelectedTools(defaultTools);
    }
  }, [mode, existingAutomation, selectedTools.length, t]);

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
    // Don't allow removing tools if only 2 remain
    if (selectedTools.length <= 2) return;
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

  const hasUnsavedChanges = () => {
    return (
      automationName.trim() !== '' ||
      selectedTools.some(tool => tool.operation !== '' || tool.configured)
    );
  };

  const canSaveAutomation = () => {
    return (
      automationName.trim() !== '' &&
      selectedTools.length > 0 &&
      selectedTools.every(tool => tool.configured && tool.operation !== '')
    );
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


        {/* Selected Tools List */}
        {selectedTools.length > 0 && (
          <div>
            <Text size="sm" fw={500} mb="xs" style={{ color: 'var(--mantine-color-text)' }}>
              {t('automate.creation.tools.selected', 'Selected Tools')} ({selectedTools.length})
            </Text>
            <Stack gap="0" style={{
            }}>
              {selectedTools.map((tool, index) => (
                <React.Fragment key={tool.id}>
                  <div
                    style={{
                      border: '1px solid var(--mantine-color-gray-2)',
                      borderRadius: 'var(--mantine-radius-sm)',
                      position: 'relative',
                      padding: 'var(--mantine-spacing-xs)'
                    }}
                  >
                    {/* Delete X in top right */}
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      onClick={() => removeTool(index)}
                      title={t('automate.creation.tools.remove', 'Remove tool')}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        zIndex: 1,
                        color: 'var(--mantine-color-gray-6)'
                      }}
                    >
                      <CloseIcon style={{ fontSize: 12 }} />
                    </ActionIcon>

                    <div style={{ paddingRight: '1.25rem' }}>
                      {/* Tool Selection Dropdown with inline settings cog */}
                      <Group gap="xs" align="center" wrap="nowrap">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <ToolSelector
                            key={`tool-selector-${tool.id}`}
                            onSelect={(newOperation) => {
                              const updatedTools = [...selectedTools];
                              
                              // Get default parameters from the tool
                              let defaultParams = {};
                              const tool = toolRegistry?.[newOperation];
                              if (tool?.component && (tool.component as any).getDefaultParameters) {
                                try {
                                  defaultParams = (tool.component as any).getDefaultParameters();
                                } catch (error) {
                                  console.warn(`Failed to get default parameters for ${newOperation}:`, error);
                                }
                              }
                              
                              updatedTools[index] = {
                                ...updatedTools[index],
                                operation: newOperation,
                                name: getToolName(newOperation),
                                configured: false,
                                parameters: defaultParams
                              };
                              setSelectedTools(updatedTools);
                            }}
                            excludeTools={['automate']}
                            toolRegistry={toolRegistry}
                            selectedValue={tool.operation}
                            placeholder={tool.name}
                          />
                        </div>

                        {/* Settings cog - only show if tool is selected, aligned right */}
                        {tool.operation && (
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => configureTool(index)}
                            title={t('automate.creation.tools.configure', 'Configure tool')}
                            style={{ color: 'var(--mantine-color-gray-6)' }}
                          >
                            <SettingsIcon style={{ fontSize: 16 }} />
                          </ActionIcon>
                        )}
                      </Group>

                      {/* Configuration status underneath */}
                      {tool.operation && !tool.configured && (
                        <Text pl="md" size="xs" c="dimmed" mt="xs">
                          {t('automate.creation.tools.notConfigured', "! Not Configured")}
                        </Text>
                      )}
                    </div>
                  </div>

                  {index < selectedTools.length - 1 && (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <Text size="xs" c="dimmed">↓</Text>
                    </div>
                  )}
                </React.Fragment>
              ))}

              {/* Arrow before Add Tool Button */}
              {selectedTools.length > 0 && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <Text size="xs" c="dimmed">↓</Text>
                </div>
              )}

              {/* Add Tool Button */}
              <div style={{
                border: '1px solid var(--mantine-color-gray-2)',
                borderRadius: 'var(--mantine-radius-sm)',
                overflow: 'hidden'
              }}>
                <AutomationEntry
                  title={t('automate.creation.tools.addTool', 'Add Tool')}
                  badgeIcon={AddCircleOutline}
                  operations={[]}
                  onClick={() => {
                    const newTool: AutomationTool = {
                      id: `tool-${Date.now()}`,
                      operation: '',
                      name: t('automate.creation.tools.selectTool', 'Select a tool...'),
                      configured: false,
                      parameters: {}
                    };
                    setSelectedTools([...selectedTools, newTool]);
                  }}
                  keepIconColor={true}
                />
              </div>
            </Stack>
          </div>
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
