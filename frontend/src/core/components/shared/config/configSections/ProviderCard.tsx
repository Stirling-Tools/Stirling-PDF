import { useEffect, useState } from 'react';
import { Paper, Group, Text, Button, Collapse, Stack, TextInput, Textarea, Switch, PasswordInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Provider, ProviderField } from '@app/components/shared/config/configSections/providerDefinitions';

interface ProviderCardProps {
  provider: Provider;
  isConfigured: boolean;
  settings?: Record<string, any>;
  onSave?: (settings: Record<string, any>) => void;
  onDisconnect?: () => void;
  disabled?: boolean;
}

export default function ProviderCard({
  provider,
  isConfigured,
  settings = {},
  onSave,
  onDisconnect,
  disabled = false,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [localSettings, setLocalSettings] = useState<Record<string, any>>(settings);

  // Keep local settings in sync with incoming settings (values loaded from settings.yml)
  useEffect(() => {
    if (!expanded) {
      setLocalSettings(settings);
    }
  }, [settings, expanded]);

  // Initialize local settings with defaults when opening an unconfigured provider
  const handleConnectToggle = () => {
    if (!isConfigured && !expanded) {
      // First time opening an unconfigured provider - initialize with defaults
      // while preserving any values already present (from settings.yml)
      const defaultSettings: Record<string, any> = { ...settings };
      provider.fields.forEach((field) => {
        if (field.defaultValue !== undefined) {
          defaultSettings[field.key] = defaultSettings[field.key] ?? field.defaultValue;
        }
      });
      setLocalSettings(defaultSettings);
    }
    setExpanded(!expanded);
  };

  const handleFieldChange = (key: string, value: any) => {
    if (disabled) return; // Block changes when disabled
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (onSave) {
      onSave(localSettings);
    }
    setExpanded(false);
  };

  const renderField = (field: ProviderField) => {
    const value = localSettings[field.key] ?? field.defaultValue ?? '';

    switch (field.type) {
      case 'switch':
        return (
          <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{field.label}</Text>
              <Text size="xs" c="dimmed" mt={4}>{field.description}</Text>
            </div>
            <Switch
              checked={value || false}
              onChange={(e) => handleFieldChange(field.key, e.target.checked)}
              disabled={disabled}
            />
          </div>
        );

      case 'password':
        return (
          <PasswordInput
            key={field.key}
            label={field.label}
            description={field.description}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
          />
        );

      case 'textarea':
        return (
          <Textarea
            key={field.key}
            label={field.label}
            description={field.description}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
          />
        );

      default:
        return (
          <TextInput
            key={field.key}
            label={field.label}
            description={field.description}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
          />
        );
    }
  };

  const renderProviderIcon = () => {
    // If icon starts with '/', it's a path to an SVG file
    if (provider.icon.startsWith('/')) {
      return (
        <img
          src={provider.icon}
          alt={provider.name}
          style={{ width: '1.5rem', height: '1.5rem' }}
        />
      );
    }
    // Otherwise use LocalIcon for iconify icons
    return <LocalIcon icon={provider.icon} width="1.5rem" height="1.5rem" />;
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        {/* Provider Header */}
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            {renderProviderIcon()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} size="sm">{provider.name}</Text>
              <Text size="xs" c="dimmed" truncate>{provider.scope}</Text>
            </div>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Button
              variant={isConfigured ? "subtle" : "filled"}
              size="xs"
              onClick={isConfigured ? () => setExpanded(!expanded) : handleConnectToggle}
              rightSection={
                expanded ? (
                  <LocalIcon
                    icon="close-rounded"
                    width="1rem"
                    height="1rem"
                  />
                ) : (isConfigured ? (
                  <LocalIcon
                    icon="expand-more-rounded"
                    width="1rem"
                    height="1rem"
                  />
                ) : undefined)
              }
            >
              {isConfigured
                ? (expanded ? t('admin.close', 'Close') : t('admin.expand', 'Expand'))
                : (expanded ? t('admin.close', 'Close') : t('admin.settings.connections.connect', 'Connect'))
              }
            </Button>
          </Group>
        </Group>

        {/* Expandable Settings */}
        <Collapse in={expanded}>
          <Stack gap="md" mt="xs">
            {provider.fields.map((field) => renderField(field))}

            <Group justify="flex-end" mt="sm">
              {onDisconnect && (
                <Button
                  variant="outline"
                  color="red"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={disabled}
                >
                  {t('admin.settings.connections.disconnect', 'Disconnect')}
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={disabled}>
                {t('admin.settings.save', 'Save Changes')}
              </Button>
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
