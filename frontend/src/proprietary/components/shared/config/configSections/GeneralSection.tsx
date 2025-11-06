import React from 'react';
import { Stack, Text, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@app/auth/UseSession';
import { useNavigate } from 'react-router-dom';
import CoreGeneralSection from '@core/components/shared/config/configSections/GeneralSection';

/**
 * Proprietary extension of GeneralSection that adds account management
 */
const GeneralSection: React.FC = () => {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <Stack gap="lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text fw={600} size="lg">{t('settings.general.title', 'General')}</Text>
          <Text size="sm" c="dimmed">
            {t('settings.general.description', 'Configure general application preferences.')}
          </Text>
        </div>

        {user && (
          <Stack gap="xs" align="flex-end">
            <Text size="sm" c="dimmed">
              {t('settings.general.user', 'User')}: <strong>{user.email || user.username}</strong>
            </Text>
            <Button color="red" variant="outline" size="xs" onClick={handleLogout}>
              {t('settings.general.logout', 'Log out')}
            </Button>
          </Stack>
        )}
      </div>

      {/* Render core general section preferences (without title since we show it above) */}
      <CoreGeneralSection hideTitle />
    </Stack>
  );
};

export default GeneralSection;
