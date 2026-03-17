import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@mantine/core';
import LoginRightCarousel from '@app/components/shared/LoginRightCarousel';
import buildLoginSlides from '@app/components/shared/loginSlides';
import { useLogoVariant } from '@app/hooks/useLogoVariant';
import { useToast } from '@app/components/toast/ToastContext';
import { OPEN_SIGN_IN_EVENT } from '@app/components/SignInModal';

const ONBOARDING_SHOWN_KEY = 'stirling-onboarding-shown';

export function FirstLaunchOnboarding() {
  const { t } = useTranslation();
  const { show } = useToast();
  const logoVariant = useLogoVariant();
  const slides = useMemo(() => buildLoginSlides(logoVariant, t), [logoVariant, t]);
  const [visible, setVisible] = useState(() => !localStorage.getItem(ONBOARDING_SHOWN_KEY));

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_SHOWN_KEY, 'true');
    setVisible(false);
    show({
      id: 'sign-in-prompt',
      alertType: 'neutral',
      title: t('onboarding.toast.title', 'Unlock all tools'),
      body: t(
        'onboarding.toast.body',
        'Sign in to Stirling Cloud or connect to a self-hosted server to access every feature.'
      ),
      location: 'top-right',
      isPersistentPopup: true,
      buttonText: t('onboarding.toast.signIn', 'Sign In'),
      buttonCallback: () => {
        window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
      },
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: '#1a1a2e',
      }}
    >
      <LoginRightCarousel
        imageSlides={slides}
        initialSeconds={5}
        slideSeconds={8}
        showBackground
      />
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <Button size="lg" variant="white" onClick={handleDismiss} style={{ minWidth: 200 }}>
          {t('onboarding.getStarted', 'Get Started')}
        </Button>
      </div>
    </div>
  );
}
