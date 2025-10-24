import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { alert } from '../../toast';

export function useRestartServer() {
  const { t } = useTranslation();
  const [restartModalOpened, setRestartModalOpened] = useState(false);

  const showRestartModal = () => {
    setRestartModalOpened(true);
  };

  const closeRestartModal = () => {
    setRestartModalOpened(false);
  };

  const restartServer = async () => {
    try {
      setRestartModalOpened(false);

      alert({
        alertType: 'neutral',
        title: t('admin.settings.restarting', 'Restarting Server'),
        body: t(
          'admin.settings.restartingMessage',
          'The server is restarting. Please wait a moment...'
        ),
      });

      const response = await fetch('/api/v1/admin/settings/restart', {
        method: 'POST',
      });

      if (response.ok) {
        // Wait a moment then reload the page
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        throw new Error('Failed to restart');
      }
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t(
          'admin.settings.restartError',
          'Failed to restart server. Please restart manually.'
        ),
      });
    }
  };

  return {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  };
}
