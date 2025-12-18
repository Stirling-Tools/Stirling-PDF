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
import LocalIcon from '@app/components/shared/LocalIcon';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import { getAvailableToExtensions } from '@app/utils/convertUtils';
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
  toolRegistry: Partial<ToolRegistry>;
}

export default function ToolConfigurationModal({ opened, tool, onSave, onCancel, toolRegistry }: ToolConfigurationModalProps) {
  const { t } = useTranslation();

  const [parameters, setParameters] = useState<any>({});

  // Get tool info from registry
  const toolInfo = toolRegistry[tool.operation as ToolId];
  const SettingsComponent = toolInfo?.automationSettings;

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
        <Alert icon={<LocalIcon icon="warning-rounded" width={24} height={24} />} color="orange">
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
    onSave(parameters);
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap="xs">
          <LocalIcon icon="settings-rounded" width={24} height={24} />
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
            leftSection={<LocalIcon icon="close-rounded" width={24} height={24} />}
            onClick={onCancel}
          >
            {t('automate.config.cancel', 'Cancel')}
          </Button>
          <Button
            leftSection={<LocalIcon icon="check-rounded" width={24} height={24} />}
            onClick={handleSave}
          >
            {t('automate.config.save', 'Save Configuration')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
