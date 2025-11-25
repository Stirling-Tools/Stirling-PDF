import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultAppService } from '@app/services/defaultAppService';
import { alert } from '@app/components/toast';

export const useDefaultApp = () => {
  const { t } = useTranslation();
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkDefaultStatus();
  }, []);

  const checkDefaultStatus = async () => {
    try {
      const status = await defaultAppService.isDefaultPdfHandler();
      setIsDefault(status);
    } catch (error) {
      console.error('Failed to check default status:', error);
    }
  };

  const handleSetDefault = async () => {
    setIsLoading(true);
    try {
      const result = await defaultAppService.setAsDefaultPdfHandler();

      if (result === 'set_successfully') {
        alert({
          alertType: 'success',
          title: t('defaultApp.success.title', 'Default App Set'),
          body: t('defaultApp.success.message', 'Stirling PDF is now your default PDF editor'),
        });
        setIsDefault(true);
      } else if (result === 'opened_dialog') {
        alert({
          alertType: 'neutral',
          title: t('defaultApp.settingsOpened.title', 'Settings Opened'),
          body: t('defaultApp.settingsOpened.message', 'Please select Stirling PDF in the file association dialogue'),
        });
      }
    } catch (error) {
      console.error('Failed to set default:', error);
      alert({
        alertType: 'error',
        title: t('defaultApp.error.title', 'Error'),
        body: t('defaultApp.error.message', 'Failed to set default PDF handler'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isDefault,
    isLoading,
    checkDefaultStatus,
    handleSetDefault,
  };
};
