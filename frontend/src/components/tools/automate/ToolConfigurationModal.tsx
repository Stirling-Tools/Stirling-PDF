import React, { useState, useEffect, useMemo } from 'react';
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
import { getAvailableToExtensions } from '../../../utils/convertUtils';
interface ToolConfigurationModalProps {
  opened: boolean;
  tool: {
    id: string;
    operation: string;
    name: string;
    parameters?: any;
  };
  onSave: (parameters: any) => void;
  onCancel: () => void;
  toolRegistry: ToolRegistry;
}

export default function ToolConfigurationModal({ opened, tool, onSave, onCancel, toolRegistry }: ToolConfigurationModalProps) {
  const { t } = useTranslation();

  const [parameters, setParameters] = useState<any>({});
  const [isValid, setIsValid] = useState(true);

  // Get tool info from registry
  const toolInfo = toolRegistry[tool.operation as keyof ToolRegistry];
  const SettingsComponent = toolInfo?.settingsComponent;

  // Initialize parameters from tool (which should contain defaults from registry)
  useEffect(() => {
    if (tool.parameters) {
      setParameters(tool.parameters);
    } else {
      // Fallback to empty parameters if none provided
      setParameters({});
    }
  }, [tool.parameters, tool.operation]);

  // Render the settings component
  const renderToolSettings = () => {
    if (!SettingsComponent) {
      return (
        <Alert icon={<WarningIcon />} color="orange">
          <Text size="sm">
            {t('automate.config.noSettings', 'This tool does not have configurable settings.')}
          </Text>
        </Alert>
      );
    }

    // Special handling for ConvertSettings which needs additional props
    if (tool.operation === 'convert') {
      return (
        <SettingsComponent
          parameters={parameters}
          onParameterChange={(key: string, value: any) => {
            setParameters((prev: any) => ({ ...prev, [key]: value }));
          }}
          getAvailableToExtensions={getAvailableToExtensions}
          selectedFiles={[]}
          disabled={false}
        />
      );
    }

    return (
      <SettingsComponent
        parameters={parameters}
        onParameterChange={(key: string, value: any) => {
          setParameters((prev: any) => ({ ...prev, [key]: value }));
        }}
        disabled={false}
      />
    );
  };

  const handleSave = () => {
    if (isValid) {
      onSave(parameters);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap="xs">
          <SettingsIcon />
          <Title order={3}>
            {t('automate.config.title', 'Configure {{toolName}}', { toolName: tool.name })}
          </Title>
        </Group>
      }
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('automate.config.description', 'Configure the settings for this tool. These settings will be applied when the automation runs.')}
        </Text>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {renderToolSettings()}
        </div>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            leftSection={<CloseIcon />}
            onClick={onCancel}
          >
            {t('automate.config.cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<CheckIcon />}
            onClick={handleSave}
            disabled={!isValid}
          >
            {t('automate.config.save', 'Save Configuration')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
