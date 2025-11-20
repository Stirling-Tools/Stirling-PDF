import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@app/auth/UseSession';
import { useLicense } from '@app/contexts/LicenseContext';
import { useCookieConsentContext } from '@app/contexts/CookieConsentContext';
import { mapLicenseToTier } from '@app/services/licenseService';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
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
import { userManagementService } from '@app/services/userManagementService';

const FRIENDLY_LAST_SEEN_KEY = 'upgradeBannerFriendlyLastShownAt';
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_TIER_LIMIT = 5;

const UpgradeBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { licenseInfo, loading: licenseLoading } = useLicense();
  const { hasResponded: cookieChoiceMade } = useCookieConsentContext();
  const { isOpen: tourOpen } = useOnboarding();
  const { config } = useAppConfig();
  const [sessionBlocked, setSessionBlocked] = useState(true);
  const [friendlyVisible, setFriendlyVisible] = useState(false);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalUsersLoaded, setTotalUsersLoaded] = useState(false);
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

    const handleOnboardingStart = () => {
      setSessionBlocked(true);
    };

    window.addEventListener(ONBOARDING_SESSION_EVENT, handleOnboardingStart as EventListener);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(ONBOARDING_SESSION_EVENT, handleOnboardingStart as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setTotalUsers(null);
      setTotalUsersLoaded(false);
      return;
    }

    setTotalUsersLoaded(false);
    let cancelled = false;

    const fetchTotalUsers = async () => {
      try {
        const adminData = await userManagementService.getUsers();
        if (!cancelled) {
          const count =
            typeof adminData.totalUsers === 'number' ? adminData.totalUsers : null;
          setTotalUsers(count);
        }
      } catch (error) {
        console.warn('[UpgradeBanner] Failed to fetch total users', error);
        if (!cancelled) {
          setTotalUsers(null);
        }
      } finally {
        if (!cancelled) {
          setTotalUsersLoaded(true);
        }
      }
    };

    fetchTotalUsers();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const tier = mapLicenseToTier(licenseInfo);
  const isAdmin = !!config?.isAdmin;
  const premiumEnabled = !!config?.premiumEnabled;
  const hasPaidLicense = Boolean(
    premiumEnabled || tier === 'server' || tier === 'enterprise',
  );

  const scenario = isDev ? testScenario : null;
  const scenarioIsFriendly = scenario === 'friendly';
  const scenarioIsUrgentUser = scenario === 'urgent-user';

  const userCountKnown = typeof totalUsers === 'number';
  const isUnderLimit = userCountKnown ? totalUsers! < FREE_TIER_LIMIT : null;
  const isOverLimit = userCountKnown ? totalUsers! >= FREE_TIER_LIMIT : null;

  const effectiveIsAdmin = scenario ? !scenarioIsUrgentUser : isAdmin;
  const effectiveTotalUsers = scenario ? (scenarioIsFriendly ? 3 : 8) : totalUsers;
  const effectiveTotalUsersLoaded = scenario ? true : totalUsersLoaded;
  const effectiveHasPaidLicense = scenario ? false : hasPaidLicense;
  const effectiveIsUnderLimit = scenario ? scenarioIsFriendly : isUnderLimit === true;
  const effectiveIsOverLimit = scenario ? !scenarioIsFriendly : isOverLimit === true;

  const shouldShowFriendlyBase = Boolean(
    (scenario ? true : user) &&
      effectiveIsAdmin &&
      !effectiveHasPaidLicense &&
      effectiveIsUnderLimit &&
      effectiveTotalUsersLoaded,
  );
  const shouldShowUrgentBase = Boolean(
    (scenario ? true : user) &&
      !effectiveHasPaidLicense &&
      effectiveIsOverLimit &&
      effectiveTotalUsersLoaded,
  );

  const shouldEvaluateFriendly = scenario
    ? scenarioIsFriendly
    : Boolean(
        shouldShowFriendlyBase &&
          !licenseLoading &&
          effectiveTotalUsersLoaded &&
          cookieChoiceMade &&
          !tourOpen &&
          !sessionBlocked,
      );
  const shouldEvaluateUrgent = scenario
    ? Boolean(scenario && !scenarioIsFriendly)
    : Boolean(
        shouldShowUrgentBase &&
          !licenseLoading &&
          cookieChoiceMade &&
          !tourOpen &&
          !sessionBlocked,
      );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!shouldShowFriendlyBase) {
      window.localStorage.removeItem(FRIENDLY_LAST_SEEN_KEY);
    }
  }, [shouldShowFriendlyBase]);

  useEffect(() => {
    if (scenario === 'friendly') {
      return;
    }

    if (!shouldEvaluateFriendly) {
      setFriendlyVisible(false);
      return;
    }

    if (friendlyVisible || typeof window === 'undefined') {
      return;
    }

    const lastShownRaw = window.localStorage.getItem(FRIENDLY_LAST_SEEN_KEY);
    const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : 0;
    const now = Date.now();
    const due = !Number.isFinite(lastShown) || now - lastShown >= WEEK_IN_MS;
    setFriendlyVisible(due);
  }, [scenario, shouldEvaluateFriendly, friendlyVisible]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const detail = shouldEvaluateUrgent
      ? {
          active: true,
          audience: effectiveIsAdmin ? 'admin' : 'user',
          totalUsers: effectiveTotalUsers ?? null,
          freeTierLimit: FREE_TIER_LIMIT,
        }
      : { active: false };

    window.dispatchEvent(
      new CustomEvent(UPGRADE_BANNER_ALERT_EVENT, { detail }),
    );
  }, [shouldEvaluateUrgent, effectiveIsAdmin, effectiveTotalUsers, scenario]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(UPGRADE_BANNER_ALERT_EVENT, { detail: { active: false } }),
        );
      }
    };
  }, []);

  useEffect(() => {
    if (friendlyVisible && typeof window !== 'undefined') {
      window.localStorage.setItem(FRIENDLY_LAST_SEEN_KEY, Date.now().toString());
    }
  }, [friendlyVisible]);

  const handleUpgrade = () => {
    navigate('/settings/adminPlan');
    setFriendlyVisible(false);
  };

  const handleFriendlyDismiss = () => {
    setFriendlyVisible(false);
  };

  const handleSeeInfo = () => {
    if (typeof window === 'undefined' || !effectiveIsAdmin) {
      return;
    }

    // For testing: use a fixed number to show the "Server License Needed" modal
    // In production, this would use effectiveTotalUsers
    const testUserCount = 542; // Fixed for testing purposes

    const detail: ServerLicenseRequestPayload = {
      licenseNotice: {
        totalUsers: testUserCount || testUserCount,
        freeTierLimit: FREE_TIER_LIMIT,
        isOverLimit: true,
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
      return null;
    }

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
