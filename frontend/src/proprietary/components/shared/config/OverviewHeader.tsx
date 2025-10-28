import { Text, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@app/auth/UseSession';
import { useNavigate } from 'react-router-dom';

export function OverviewHeader() {
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <Text fw={600} size="lg">{t('config.overview.title', 'Application Configuration')}</Text>
          <Text size="sm" c="dimmed">
            {t('config.overview.description', 'Current application settings and configuration details.')}
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
  );
}
