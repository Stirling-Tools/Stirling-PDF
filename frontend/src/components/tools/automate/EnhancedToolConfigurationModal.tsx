import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Title,
  Button,
  Group,
  Stack,
  Text,
  Alert
} from '@mantine/core';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import { ToolRegistry } from '../../../data/toolsTaxonomy';
import { ToolDefinition } from '../shared/toolDefinition';
import { getAvailableToExtensions } from '../../../utils/convertUtils';
import DefinitionBasedToolConfig from './DefinitionBasedToolConfig';

interface EnhancedToolConfigurationModalProps {
  opened: boolean;
  tool: {
    id: string;
    operation: string;
    name: string;
    parameters?: unknown;
  };
  onSave: (parameters: unknown) => void;
  onCancel: () => void;
  toolRegistry: ToolRegistry;
}

export default function EnhancedToolConfigurationModal({
  opened,
  tool,
  onSave,
  onCancel,
  toolRegistry
}: EnhancedToolConfigurationModalProps) {
  const { t } = useTranslation();

  const [legacyParameters, setLegacyParameters] = useState<Record<string, unknown>>({});
  const [isValid, setIsValid] = useState(true);

  // Get tool info from registry
  const toolInfo = toolRegistry[tool.operation as keyof ToolRegistry];
  const hasDefinition = !!toolInfo?.definition;
  const SettingsComponent = toolInfo?.settingsComponent;

  // For definition-based tools, use the actual hook
  const definitionParams = hasDefinition ? (toolInfo.definition as ToolDefinition<unknown>).useParameters() : null;

  // Initialize legacy parameters
  useEffect(() => {
    if (!hasDefinition) {
      if (tool.parameters) {
        setLegacyParameters(tool.parameters as Record<string, unknown>);
      } else {
        setLegacyParameters({});
      }
    }
  }, [tool.parameters, tool.operation, hasDefinition]);

  // Handle parameter changes
  const handleParameterChange = (key: string, value: unknown) => {
    if (hasDefinition && definitionParams) {
      definitionParams.updateParameter(key, value);
    } else {
      setLegacyParameters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const parameters = hasDefinition && definitionParams ? definitionParams.parameters : legacyParameters;

  // Render the settings component
  const renderToolSettings = () => {
    if (hasDefinition) {
      // Use definition-based rendering
      const definition = toolInfo.definition as ToolDefinition<unknown>;
      return (
        <DefinitionBasedToolConfig
          definition={definition}
          parameters={parameters}
          onParameterChange={handleParameterChange}
          disabled={false}
        />
      );
    }

    if (!SettingsComponent) {
      return (
        <Alert icon={<WarningIcon />} color="orange">
          <Text size="sm">
            {t('automate.config.noSettings', 'This tool does not have configurable settings.')}
          </Text>
        </Alert>
      );
    }

    // Legacy settings component rendering
    if (tool.operation === 'convert') {
      return (
        <SettingsComponent
          parameters={parameters}
          onParameterChange={handleParameterChange}
          getAvailableToExtensions={getAvailableToExtensions}
          selectedFiles={[]}
          disabled={false}
        />
      );
    }

    return (
      <SettingsComponent
        parameters={parameters}
        onParameterChange={handleParameterChange}
        disabled={false}
      />
    );
  };

  const handleSave = () => {
    if (isValid) {
      const finalParameters = hasDefinition && definitionParams ? definitionParams.parameters : legacyParameters;
      onSave(finalParameters);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap="xs">
          <SettingsIcon />
          <Title order={4}>
            {t('automate.config.title', 'Configure {{toolName}}', { toolName: tool.name })}
          </Title>
        </Group>
      }
      size="lg"
      scrollAreaComponent="div"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {hasDefinition
            ? t('automate.config.descriptionDefinition', 'Configure settings for this tool. These settings will be applied when the automation runs.')
            : t('automate.config.descriptionLegacy', 'Configure settings for this tool using the legacy interface.')
          }
        </Text>

        <div style={{ minHeight: '200px' }}>
          {renderToolSettings()}
        </div>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            leftSection={<CloseIcon />}
            onClick={onCancel}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<CheckIcon />}
            onClick={handleSave}
            disabled={!isValid}
          >
            {t('common.save', 'Save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
