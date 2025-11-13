import { useState, useEffect } from 'react';
import { defaultAppService } from '@app/services/defaultAppService';
import { alert } from '@app/components/toast';
import { useTranslation } from 'react-i18next';

export function useDefaultAppPrompt() {
  const { t } = useTranslation();
  const [promptOpened, setPromptOpened] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);

  // Check on mount if we should show the prompt
  useEffect(() => {
    const checkShouldPrompt = async () => {
      try {
        const shouldShow = await defaultAppService.shouldShowPrompt();
        if (shouldShow) {
          // Small delay so it doesn't show immediately on app launch
          setTimeout(() => setPromptOpened(true), 2000);
        }
      } catch (error) {
        console.error('[DefaultAppPrompt] Failed to check prompt status:', error);
      }
    };

    checkShouldPrompt();
  }, []);

  const handleSetDefault = async () => {
    setIsSettingDefault(true);
    try {
      const result = await defaultAppService.setAsDefaultPdfHandler();

      if (result === 'set_successfully') {
        alert({
          alertType: 'success',
          title: t('defaultApp.success.title', 'Default App Set'),
          body: t(
            'defaultApp.success.message',
            'Stirling PDF is now your default PDF editor'
          ),
        });
      } else if (result === 'opened_settings') {
        alert({
          alertType: 'neutral',
          title: t('defaultApp.settingsOpened.title', 'Settings Opened'),
          body: t(
            'defaultApp.settingsOpened.message',
            'Please select Stirling PDF in your system settings'
          ),
        });
      }

      // Mark as dismissed regardless of outcome
      defaultAppService.setPromptDismissed(true);
      setPromptOpened(false);
    } catch (error) {
      console.error('[DefaultAppPrompt] Failed to set default handler:', error);
      alert({
        alertType: 'error',
        title: t('defaultApp.error.title', 'Error'),
        body: t(
          'defaultApp.error.message',
          'Failed to set default PDF handler'
        ),
      });
    } finally {
      setIsSettingDefault(false);
    }
  };

  const handleDismiss = () => {
    defaultAppService.setPromptDismissed(true);
    setPromptOpened(false);
  };

  return {
    promptOpened,
    isSettingDefault,
    handleSetDefault,
    handleDismiss,
  };
}
