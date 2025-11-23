import React from 'react';
import { useTranslation } from 'react-i18next';
import { SlideConfig, LicenseNotice } from '../../../types/types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface PlanOverviewSlideProps {
  isAdmin: boolean;
  licenseNotice?: LicenseNotice;
  loginEnabled?: boolean;
}

const DEFAULT_FREE_TIER_LIMIT = 5;

export default function PlanOverviewSlide({
  isAdmin,
  licenseNotice,
  loginEnabled = false,
}: PlanOverviewSlideProps): SlideConfig {
  const { t } = useTranslation();
  const freeTierLimit = licenseNotice?.freeTierLimit ?? DEFAULT_FREE_TIER_LIMIT;

  const adminBodyKey = loginEnabled
    ? 'onboarding.planOverview.adminBodyLoginEnabled'
    : 'onboarding.planOverview.adminBodyLoginDisabled';
  const adminBodyTemplate = t(adminBodyKey, {
    freeTierLimit: '{{freeTierLimit}}',
    defaultValue: loginEnabled
      ? 'As an admin, you can manage users, configure settings, and monitor server health. The first {{freeTierLimit}} people on your server get to use Stirling free of charge.'
      : 'Once you enable login mode, you can manage users, configure settings, and monitor server health. The first {{freeTierLimit}} people on your server get to use Stirling free of charge.',
  });

  const renderAdminBody = () => {
    const [before, after] = adminBodyTemplate.split('{{freeTierLimit}}');
    if (after !== undefined) {
      return (
        <span>
          {before}
          <strong>{freeTierLimit}</strong>
          {after}
        </span>
      );
    }
    return (
      <span>
        {adminBodyTemplate.replace('{{freeTierLimit}}', String(freeTierLimit))}
      </span>
    );
  };

  return {
    key: isAdmin ? 'admin-overview' : 'plan-overview',
    title: isAdmin 
      ? t('onboarding.planOverview.adminTitle', 'Admin Overview')
      : t('onboarding.planOverview.userTitle', 'Plan Overview'),
    body: isAdmin ? renderAdminBody() : (
      <span>
        {t('onboarding.planOverview.userBody', 'Invite teammates, assign roles, and keep your documents organized in one secure workspace. Enable login mode whenever you\'re ready to grow beyond solo use.')}
      </span>
    ),
    background: {
      gradientStops: isAdmin ? ['#4F46E5', '#0EA5E9'] : ['#F97316', '#EF4444'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

