import { useState, useEffect } from 'react';
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
import { Z_INDEX_AUTOMATE_MODAL } from '@app/styles/zIndex';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import { getAvailableToExtensions } from '@app/utils/convertUtils';
import type { AutomationParameters } from '@app/types/automation';

type BaseSettingsComponent = React.ComponentType<{
  parameters: AutomationParameters;
  onParameterChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}>;

type ConvertSettingsComponent = React.ComponentType<{
  parameters: AutomationParameters;
  onParameterChange: (key: string, value: unknown) => void;
  getAvailableToExtensions: typeof getAvailableToExtensions;
  selectedFiles: File[];
  disabled?: boolean;
}>;

interface ToolConfigurationModalProps {
  opened: boolean;
  tool: {
    id: string;
    operation: string;
    name: string;
    parameters?: AutomationParameters;
  };
  onSave: (parameters: AutomationParameters) => void;
  onCancel: () => void;
  toolRegistry: Partial<ToolRegistry>;
}

export default function ToolConfigurationModal({ opened, tool, onSave, onCancel, toolRegistry }: ToolConfigurationModalProps) {
  const { t } = useTranslation();

  const [parameters, setParameters] = useState<AutomationParameters>({});

  // Get tool info from registry
  const toolInfo = toolRegistry[tool.operation as ToolId];
  const SettingsComponent = toolInfo?.automationSettings as BaseSettingsComponent | ConvertSettingsComponent | undefined;

  // Initialize parameters from tool (which should contain defaults from registry)
  useEffect(() => {
    if (tool.parameters) {
      setParameters(tool.parameters);
    } else {
      // Fallback to empty parameters if none provided
      setParameters({});
    }
  }, [tool.parameters, tool.operation]);

  const updateParameter = (key: string, value: unknown) => {
    setParameters(prev => ({
      ...prev,
      [key]: value,
    }));
  };

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
      const ConvertComponent = SettingsComponent as ConvertSettingsComponent;
      return (
        <ConvertComponent
          parameters={parameters}
          onParameterChange={updateParameter}
          getAvailableToExtensions={getAvailableToExtensions}
          selectedFiles={[]}
          disabled={false}
        />
      );
    }

    const GenericComponent = SettingsComponent as BaseSettingsComponent;
    return (
      <GenericComponent
        parameters={parameters}
        onParameterChange={updateParameter}
        disabled={false}
      />
    );
  };

  const handleSave = () => {
    onSave(parameters);
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
      zIndex={Z_INDEX_AUTOMATE_MODAL}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('automate.config.description', 'Configure the settings for this tool. These settings will be applied when the automation runs.')}
        </Text>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: "hidden" }}>
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
          >
            {t('automate.config.save', 'Save Configuration')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
