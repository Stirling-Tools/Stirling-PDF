import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Modal, 
  Title, 
  Button, 
  Group, 
  Stack,
  Text,
  Alert,
  Loader
} from '@mantine/core';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
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
}

export default function ToolConfigurationModal({ opened, tool, onSave, onCancel }: ToolConfigurationModalProps) {
  const { t } = useTranslation();
  
  const [parameters, setParameters] = useState<any>({});
  const [isValid, setIsValid] = useState(true);
  const [SettingsComponent, setSettingsComponent] = useState<React.ComponentType<any> | null>(null);
  const [parameterHook, setParameterHook] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dynamically load the settings component and parameter hook based on tool
  useEffect(() => {
    const loadToolComponents = async () => {
      setLoading(true);
      
      try {
        let settingsModule, parameterModule;
        
        switch (tool.operation) {
          case 'compress':
            [settingsModule, parameterModule] = await Promise.all([
              import('../compress/CompressSettings'),
              import('../../../hooks/tools/compress/useCompressParameters')
            ]);
            break;
            
          case 'split':
            [settingsModule, parameterModule] = await Promise.all([
              import('../split/SplitSettings'),
              import('../../../hooks/tools/split/useSplitParameters')
            ]);
            break;
            
          case 'addPassword':
            [settingsModule, parameterModule] = await Promise.all([
              import('../addPassword/AddPasswordSettings'),
              import('../../../hooks/tools/addPassword/useAddPasswordParameters')
            ]);
            break;
            
          case 'removePassword':
            [settingsModule, parameterModule] = await Promise.all([
              import('../removePassword/RemovePasswordSettings'),
              import('../../../hooks/tools/removePassword/useRemovePasswordParameters')
            ]);
            break;
            
          case 'changePermissions':
            [settingsModule, parameterModule] = await Promise.all([
              import('../changePermissions/ChangePermissionsSettings'),
              import('../../../hooks/tools/changePermissions/useChangePermissionsParameters')
            ]);
            break;
            
          case 'sanitize':
            [settingsModule, parameterModule] = await Promise.all([
              import('../sanitize/SanitizeSettings'),
              import('../../../hooks/tools/sanitize/useSanitizeParameters')
            ]);
            break;
            
          case 'ocr':
            [settingsModule, parameterModule] = await Promise.all([
              import('../ocr/OCRSettings'),
              import('../../../hooks/tools/ocr/useOCRParameters')
            ]);
            break;
            
          case 'convert':
            [settingsModule, parameterModule] = await Promise.all([
              import('../convert/ConvertSettings'),
              import('../../../hooks/tools/convert/useConvertParameters')
            ]);
            break;
            
          default:
            setSettingsComponent(null);
            setParameterHook(null);
            setLoading(false);
            return;
        }
        
        setSettingsComponent(() => settingsModule.default);
        setParameterHook(() => parameterModule);
      } catch (error) {
        console.error(`Error loading components for ${tool.operation}:`, error);
        setSettingsComponent(null);
        setParameterHook(null);
      }
      
      setLoading(false);
    };
    
    if (opened && tool.operation) {
      loadToolComponents();
    }
  }, [opened, tool.operation]);

  // Initialize parameters from tool or use defaults from hook
  useEffect(() => {
    if (tool.parameters) {
      setParameters(tool.parameters);
    } else if (parameterHook) {
      // If we have a parameter hook, use it to get default values
      try {
        const defaultParams = parameterHook();
        setParameters(defaultParams.parameters || {});
      } catch (error) {
        console.warn(`Error getting default parameters for ${tool.operation}:`, error);
        setParameters({});
      }
    } else {
      setParameters({});
    }
  }, [tool.parameters, parameterHook, tool.operation]);

  // Render the settings component
  const renderToolSettings = () => {
    if (loading) {
      return (
        <Stack align="center" gap="md" py="xl">
          <Loader size="md" />
          <Text size="sm" c="dimmed">
            {t('automate.config.loading', 'Loading tool configuration...')}
          </Text>
        </Stack>
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