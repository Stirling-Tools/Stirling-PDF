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
  Badge,
  Alert
} from '@mantine/core';
import CheckIcon from '@mui/icons-material/Check';
import InfoIcon from '@mui/icons-material/Info';
import { ToolRegistry } from '../../../data/toolsTaxonomy';
import EnhancedToolConfigurationModal from './EnhancedToolConfigurationModal';
import ToolList from './ToolList';
import IconSelector from './IconSelector';
import { AutomationConfig, AutomationMode, AutomationTool } from '../../../types/automation';
import { useEnhancedAutomationForm } from '../../../hooks/tools/automate/useEnhancedAutomationForm';

interface AutomationCreationEnhancedProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  onBack: () => void;
  onComplete: (automation: AutomationConfig) => void;
  toolRegistry: ToolRegistry;
}

/**
 * Enhanced automation creation component that works with both definition-based and legacy tools
 */
export default function AutomationCreationEnhanced({ 
  mode, 
  existingAutomation, 
  onBack, 
  onComplete, 
  toolRegistry 
}: AutomationCreationEnhancedProps) {
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
    getAutomatableTools,
    isToolAutomatable
  } = useEnhancedAutomationForm({ mode, existingAutomation, toolRegistry });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTool, setConfigTool] = useState<AutomationTool | null>(null);

  const automatableTools = getAutomatableTools();
  const definitionBasedCount = automatableTools.filter(tool => tool.hasDefinition).length;
  const legacyCount = automatableTools.filter(tool => tool.hasLegacySettings).length;

  const handleToolConfig = (tool: AutomationTool) => {
    setConfigTool(tool);
    setConfigModalOpen(true);
  };

  const handleConfigSave = (parameters: unknown) => {
    if (configTool) {
      updateTool(configTool.id, { 
        parameters: parameters as Record<string, unknown>, 
        configured: true 
      });
    }
    setConfigModalOpen(false);
    setConfigTool(null);
  };

  const handleConfigCancel = () => {
    setConfigModalOpen(false);
    setConfigTool(null);
  };

  const handleSave = () => {
    const automation: AutomationConfig = {
      id: existingAutomation?.id || `automation-${Date.now()}`,
      name: automationName,
      description: automationDescription,
      icon: automationIcon,
      operations: selectedTools.map(tool => ({
        operation: tool.operation,
        parameters: tool.parameters
      })),
      createdAt: existingAutomation?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    onComplete(automation);
  };

  return (
    <>
      <Stack gap="lg">
        {/* Info about tool types */}
        <Alert icon={<InfoIcon />} color="blue">
          <Text size="sm">
            {t('automate.enhanced.info', 
              'Enhanced automation now supports {{definitionCount}} definition-based tools and {{legacyCount}} legacy tools.', 
              { definitionCount: definitionBasedCount, legacyCount: legacyCount }
            )}
          </Text>
        </Alert>

        {/* Automation Details */}
        <Stack gap="md">
          <Text size="lg" fw={600}>
            {mode === AutomationMode.EDIT 
              ? t('automate.edit.title', 'Edit Automation')
              : t('automate.create.title', 'Create New Automation')
            }
          </Text>

          <Group grow>
            <TextInput
              label={t('automate.name.label', 'Automation Name')}
              placeholder={t('automate.name.placeholder', 'Enter automation name')}
              value={automationName}
              onChange={(e) => setAutomationName(e.target.value)}
              required
            />
            <IconSelector
              value={automationIcon}
              onChange={setAutomationIcon}
            />
          </Group>

          <Textarea
            label={t('automate.description.label', 'Description')}
            placeholder={t('automate.description.placeholder', 'Describe what this automation does')}
            value={automationDescription}
            onChange={(e) => setAutomationDescription(e.target.value)}
            rows={3}
          />
        </Stack>

        <Divider />

        {/* Tool Selection and Configuration */}
        <Stack gap="md">
          <Text size="md" fw={600}>
            {t('automate.tools.title', 'Selected Tools')}
          </Text>

          {selectedTools.length > 0 && (
            <Stack gap="sm">
              {selectedTools.map((tool, index) => {
                const toolEntry = toolRegistry[tool.operation as keyof ToolRegistry];
                const hasDefinition = !!toolEntry?.definition;
                
                return (
                  <Group key={tool.id} justify="space-between" p="sm" style={{ border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    <Group>
                      <Text fw={500}>{index + 1}.</Text>
                      <Text>{tool.name}</Text>
                      {hasDefinition && (
                        <Badge size="xs" color="blue">Definition-based</Badge>
                      )}
                      {!hasDefinition && toolEntry?.settingsComponent && (
                        <Badge size="xs" color="orange">Legacy</Badge>
                      )}
                      {tool.configured && (
                        <Badge size="xs" color="green">Configured</Badge>
                      )}
                    </Group>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleToolConfig(tool)}
                      >
                        {tool.configured 
                          ? t('automate.tool.reconfigure', 'Reconfigure')
                          : t('automate.tool.configure', 'Configure')
                        }
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        color="red"
                        onClick={() => removeTool(tool.id)}
                      >
                        {t('common.remove', 'Remove')}
                      </Button>
                    </Group>
                  </Group>
                );
              })}
            </Stack>
          )}

          <ToolList
            toolRegistry={toolRegistry}
            onToolSelect={addTool}
            selectedToolIds={selectedTools.map(t => t.operation)}
            showOnlyAutomatable={true}
            automatableToolsFilter={isToolAutomatable}
          />
        </Stack>

        {/* Action Buttons */}
        <Group justify="flex-end" gap="sm">
          <Button variant="outline" onClick={onBack}>
            {t('common.back', 'Back')}
          </Button>
          <Button
            leftSection={<CheckIcon />}
            onClick={handleSave}
            disabled={!canSaveAutomation}
          >
            {mode === AutomationMode.EDIT 
              ? t('automate.update', 'Update Automation')
              : t('automate.create', 'Create Automation')
            }
          </Button>
        </Group>
      </Stack>

      {/* Configuration Modal */}
      {configModalOpen && configTool && (
        <EnhancedToolConfigurationModal
          opened={configModalOpen}
          tool={configTool}
          onSave={handleConfigSave}
          onCancel={handleConfigCancel}
          toolRegistry={toolRegistry}
        />
      )}
    </>
  );
}