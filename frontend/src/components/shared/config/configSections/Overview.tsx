import React from 'react';
import { Stack, Text, Code, Group, Badge, Alert, Loader, Button } from '@mantine/core';
import { useAppConfig } from '../../../../hooks/useAppConfig';
import { useAuth } from '../../../../auth/UseSession';
import { useNavigate } from 'react-router-dom';

const Overview: React.FC = () => {
  const { config, loading, error } = useAppConfig();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const renderConfigSection = (title: string, data: any) => {
    if (!data || typeof data !== 'object') return null;

    return (
      <Stack gap="xs" mb="md">
        <Text fw={600} size="md" c="blue">{title}</Text>
        <Stack gap="xs" pl="md">
          {Object.entries(data).map(([key, value]) => (
            <Group key={key} wrap="nowrap" align="flex-start">
              <Text size="sm" w={150} style={{ flexShrink: 0 }} c="dimmed">
                {key}:
              </Text>
              {typeof value === 'boolean' ? (
                <Badge color={value ? 'green' : 'red'} size="sm">
                  {value ? 'true' : 'false'}
                </Badge>
              ) : typeof value === 'object' ? (
                <Code block>{JSON.stringify(value, null, 2)}</Code>
              ) : (
                String(value) || 'null'
              )}
            </Group>
          ))}
        </Stack>
      </Stack>
    );
  };

  const basicConfig = config ? {
    appNameNavbar: config.appNameNavbar,
    baseUrl: config.baseUrl,
    contextPath: config.contextPath,
    serverPort: config.serverPort,
  } : null;

  const securityConfig = config ? {
    enableLogin: config.enableLogin,
  } : null;

  const systemConfig = config ? {
    enableAlphaFunctionality: config.enableAlphaFunctionality,
    enableAnalytics: config.enableAnalytics,
  } : null;

  const integrationConfig = config ? {
    SSOAutoLogin: config.SSOAutoLogin,
  } : null;

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (_error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <Stack align="center" py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading configuration...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div>
            <Text fw={600} size="lg">Application Configuration</Text>
            <Text size="sm" c="dimmed">
              Current application settings and configuration details.
            </Text>
            {user?.email && (
              <Text size="xs" c="dimmed" mt="0.25rem">
                Signed in as: {user.email}
              </Text>
            )}
          </div>
          {user && (
            <Button color="red" variant="filled" onClick={handleLogout}>
              Log out
            </Button>
          )}
        </div>
      </div>

      {config && (
        <>
          {renderConfigSection('Basic Configuration', basicConfig)}
          {renderConfigSection('Security Configuration', securityConfig)}
          {renderConfigSection('System Configuration', systemConfig)}
          {renderConfigSection('Integration Configuration', integrationConfig)}

          {config.error && (
            <Alert color="yellow" title="Configuration Warning">
              {config.error}
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
};

export default Overview;