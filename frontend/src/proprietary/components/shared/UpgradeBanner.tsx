import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { InfoBanner } from '@app/components/shared/InfoBanner';
import {
  ONBOARDING_SESSION_BLOCK_KEY,
  ONBOARDING_SESSION_EVENT,
  SERVER_LICENSE_REQUEST_EVENT,
  type ServerLicenseRequestPayload,
  UPGRADE_BANNER_TEST_EVENT,
  type UpgradeBannerTestPayload,
  type UpgradeBannerTestScenario,
  UPGRADE_BANNER_ALERT_EVENT,
} from '@core/constants/events';
import { useServerExperience } from '@app/hooks/useServerExperience';

const FRIENDLY_LAST_SEEN_KEY = 'upgradeBannerFriendlyLastShownAt';
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const UpgradeBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen: tourOpen } = useOnboarding();
  const { openCheckout } = useCheckout();
  const {
    totalUsers,
    userCountResolved,
    userCountLoading,
    effectiveIsAdmin: configIsAdmin,
    hasPaidLicense,
    licenseLoading,
    freeTierLimit,
    overFreeTierLimit,
    scenarioKey,
  } = useServerExperience();
  const [sessionBlocked, setSessionBlocked] = useState(true);
  const [friendlyVisible, setFriendlyVisible] = useState(false);
  const isDev = import.meta.env.DEV;
  const [testScenario, setTestScenario] = useState<UpgradeBannerTestScenario>(null);

  // Track onboarding session flag so we don't show banner if onboarding ran this load
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const evaluateBlock = () => {
      const blocked = window.sessionStorage.getItem(ONBOARDING_SESSION_BLOCK_KEY) === 'true';
      setSessionBlocked(blocked);
    };

    evaluateBlock();

    const timer = window.setTimeout(() => {
      evaluateBlock();
    }, 1000);

    const handleOnboardingEvent = () => {
      evaluateBlock();
    };

    window.addEventListener(ONBOARDING_SESSION_EVENT, handleOnboardingEvent as EventListener);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(ONBOARDING_SESSION_EVENT, handleOnboardingEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isDev || typeof window === 'undefined') {
      return;
    }

    const handleTestEvent = (event: Event) => {
      const { detail } = event as CustomEvent<UpgradeBannerTestPayload>;
      setTestScenario(detail?.scenario ?? null);

      if (detail?.scenario === 'friendly') {
        setFriendlyVisible(true);
      } else if (!detail?.scenario) {
        setFriendlyVisible(false);
      }
    };

    window.addEventListener(UPGRADE_BANNER_TEST_EVENT, handleTestEvent as EventListener);
    return () => {
      window.removeEventListener(UPGRADE_BANNER_TEST_EVENT, handleTestEvent as EventListener);
    };
  }, [isDev]);

  const isAdmin = configIsAdmin;

  const scenario = isDev ? testScenario : null;
  const scenarioIsFriendly = scenario === 'friendly';
  const scenarioIsUrgentUser = scenario === 'urgent-user';

  const userCountKnown = typeof totalUsers === 'number';
  const isUnderLimit = userCountKnown ? totalUsers < freeTierLimit : null;
  const isOverLimit = userCountKnown ? totalUsers > freeTierLimit : overFreeTierLimit;
  const baseTotalUsersLoaded = userCountResolved && !userCountLoading;

  const scenarioProvidesInfo =
    scenarioKey && scenarioKey !== 'unknown' && scenarioKey !== 'licensed';
  const derivedIsAdmin = scenarioProvidesInfo
    ? scenarioKey!.includes('admin')
    : isAdmin;
  const derivedHasPaidLicense =
    scenarioKey === 'licensed'
      ? true
      : scenarioKey === 'unknown'
        ? hasPaidLicense
        : false;
  const derivedIsUnderLimit = scenarioProvidesInfo
    ? scenarioKey!.includes('under-limit')
    : isUnderLimit === true;
  const derivedIsOverLimit = scenarioProvidesInfo
    ? scenarioKey!.includes('over-limit')
    : isOverLimit === true;

  const effectiveIsAdmin = scenario
    ? scenarioIsUrgentUser
      ? false
      : true
    : derivedIsAdmin;
  const effectiveTotalUsers =
    scenario != null ? (scenarioIsFriendly ? 3 : 8) : totalUsers;
  const effectiveTotalUsersLoaded = scenario != null ? true : baseTotalUsersLoaded;
  const effectiveHasPaidLicense = scenario != null ? false : derivedHasPaidLicense;
  const effectiveIsUnderLimit =
    scenario != null ? scenarioIsFriendly : derivedIsUnderLimit;
  const effectiveIsOverLimit =
    scenario != null ? !scenarioIsFriendly : derivedIsOverLimit;

  const isDerivedAdmin = scenario
    ? !scenarioIsUrgentUser
    : scenarioKey === 'login-user-over-limit-no-license'
      ? false
      : effectiveIsAdmin;

  const shouldShowFriendlyBase = Boolean(
    isDerivedAdmin &&
      !effectiveHasPaidLicense &&
      effectiveIsUnderLimit &&
      effectiveTotalUsersLoaded,
  );
  const shouldShowUrgentBase = Boolean(
    !effectiveHasPaidLicense &&
      effectiveTotalUsersLoaded &&
      (effectiveIsOverLimit || scenarioKey === 'login-user-over-limit-no-license'),
  );

  const shouldEvaluateFriendly = scenario
    ? scenarioIsFriendly
    : Boolean(
        shouldShowFriendlyBase &&
          !licenseLoading &&
          effectiveTotalUsersLoaded &&
          !tourOpen &&
          !sessionBlocked,
      );
  const shouldEvaluateUrgent = scenario
    ? Boolean(scenario && !scenarioIsFriendly)
    : Boolean(
        shouldShowUrgentBase &&
          !licenseLoading &&
          !tourOpen &&
          !sessionBlocked,
      );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!shouldShowFriendlyBase && effectiveTotalUsersLoaded) {
      window.localStorage.removeItem(FRIENDLY_LAST_SEEN_KEY);
    }
  }, [shouldShowFriendlyBase, effectiveTotalUsersLoaded]);

  useEffect(() => {
    if (scenario === 'friendly') {
      return;
    }

    if (!shouldEvaluateFriendly) {
      setFriendlyVisible(false);
      return;
    }

    if (friendlyVisible || typeof window === 'undefined' || userCountLoading) {
      return;
    }

    const lastShownRaw = window.localStorage.getItem(FRIENDLY_LAST_SEEN_KEY);
    const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : 0;
    const now = Date.now();
    const due = !Number.isFinite(lastShown) || now - lastShown >= WEEK_IN_MS;
    setFriendlyVisible(due);
  }, [scenario, shouldEvaluateFriendly, friendlyVisible, userCountLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const detail = shouldEvaluateUrgent
      ? {
          active: true,
          audience: effectiveIsAdmin ? 'admin' : 'user',
          totalUsers: effectiveTotalUsers ?? null,
          freeTierLimit,
        }
      : { active: false };

    console.debug('[UpgradeBanner] Dispatching alert event', {
      shouldEvaluateUrgent,
      detail,
      totalUsers: effectiveTotalUsers,
      freeTierLimit,
      effectiveIsAdmin,
      effectiveHasPaidLicense,
      userCountLoaded: effectiveTotalUsersLoaded,
    });

    window.dispatchEvent(
      new CustomEvent(UPGRADE_BANNER_ALERT_EVENT, { detail }),
    );
  }, [shouldEvaluateUrgent, effectiveIsAdmin, effectiveTotalUsers, scenario, freeTierLimit]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(UPGRADE_BANNER_ALERT_EVENT, { detail: { active: false } }),
        );
      }
    };
  }, []);

  const recordFriendlyLastShown = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(FRIENDLY_LAST_SEEN_KEY, Date.now().toString());
  }, []);

  useEffect(() => {
    if (friendlyVisible) {
      recordFriendlyLastShown();
    }
  }, [friendlyVisible, recordFriendlyLastShown]);

  const handleUpgrade = () => {
    recordFriendlyLastShown();

    const hideBanner = () => setFriendlyVisible(false);
    const navigateFallback = () => {
      navigate('/settings/adminPlan');
      hideBanner();
    };

    try {
      openCheckout('server', {
        minimumSeats: 1,
        onSuccess: () => {
          hideBanner();
        },
        onError: () => {
          navigateFallback();
        },
      });
    } catch (error) {
      console.error('[UpgradeBanner] Failed to open checkout, redirecting instead', error);
      navigateFallback();
      return;
    }

    // Keep legacy behavior so banner disappears once the user initiates checkout
    hideBanner();
  };

  const handleFriendlyDismiss = () => {
    recordFriendlyLastShown();
    setFriendlyVisible(false);
  };

  const handleSeeInfo = () => {
    if (typeof window === 'undefined' || !effectiveIsAdmin) {
      return;
    }

    const detail: ServerLicenseRequestPayload = {
      licenseNotice: {
        totalUsers: effectiveTotalUsers ?? null,
        freeTierLimit,
        isOverLimit: effectiveIsOverLimit ?? false,
      },
      selfReportedAdmin: true,
      deferUntilTourComplete: false,
    };

    window.dispatchEvent(
      new CustomEvent(SERVER_LICENSE_REQUEST_EVENT, { detail }),
    );
  };

  const renderUrgentBanner = () => {
    if (!shouldEvaluateUrgent) {
      console.debug('[UpgradeBanner] renderUrgentBanner → hidden (shouldEvaluateUrgent=false)');
      return null;
    }
    console.debug('[UpgradeBanner] renderUrgentBanner → visible', {
      totalUsers: effectiveTotalUsers,
      freeTierLimit,
      effectiveIsAdmin,
      effectiveHasPaidLicense,
    });

    const buttonText = effectiveIsAdmin ? t('upgradeBanner.seeInfo', 'See info') : undefined;

    const attentionMessage = effectiveIsAdmin
      ? t(
          'upgradeBanner.attentionBodyAdmin',
          'Review the license requirements to keep this server compliant.',
        )
      : t(
          'upgradeBanner.attentionBody',
          'Your admin needs to sign in to see more info. Please contact them immediately.',
        );

    return (
      <InfoBanner
        icon="warning-rounded"
        tone="warning"
        title={t('upgradeBanner.attentionTitle', 'This server needs admin attention')}
        message={attentionMessage}
        buttonText={buttonText}
        buttonIcon="info-rounded"
        onButtonClick={buttonText ? handleSeeInfo : undefined}
        dismissible={false}
        minHeight={60}
        background="#FFF4E6"
        borderColor="var(--mantine-color-orange-7)"
        textColor="#9A3412"
        iconColor="#EA580C"
        buttonVariant="filled"
        buttonColor="orange.7"
      />
    );
  };

  if (!friendlyVisible && !shouldEvaluateUrgent) {
    return null;
  }

  return (
    <>
      {friendlyVisible && (
        <InfoBanner
          icon="stars-rounded"
          title={t('upgradeBanner.title', 'Upgrade to Server Plan')}
          message={t(
            'upgradeBanner.message',
            'Get the most out of Stirling PDF with unlimited users and advanced features.',
          )}
          buttonText={t('upgradeBanner.upgradeButton', 'Upgrade Now')}
          buttonIcon="upgrade-rounded"
          onButtonClick={handleUpgrade}
          onDismiss={handleFriendlyDismiss}
          show={friendlyVisible}
          background="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          borderColor="transparent"
          textColor="#fff"
          iconColor="#fff"
          closeIconColor="#fff"
          buttonVariant="white"
          buttonColor="blue"
          minHeight={64}
        />
      )}
      {renderUrgentBanner()}
    </>
  );
};

export default UpgradeBanner;
