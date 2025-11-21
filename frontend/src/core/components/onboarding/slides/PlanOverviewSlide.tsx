import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { SlideConfig, LicenseNotice } from '../../../types/types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface PlanOverviewSlideProps {
  isAdmin: boolean;
  licenseNotice?: LicenseNotice;
}

const DEFAULT_FREE_TIER_LIMIT = 5;

export default function PlanOverviewSlide({ isAdmin, licenseNotice }: PlanOverviewSlideProps): SlideConfig {
  const { t } = useTranslation();
  const freeTierLimit = licenseNotice?.freeTierLimit ?? DEFAULT_FREE_TIER_LIMIT;

  const adminBody = (
    <span>
      <Trans
        i18nKey="onboarding.planOverview.adminBody"
        components={{ strong: <strong /> }}
        values={{ freeTierLimit }}
        defaults="As an admin, you can manage users, configure settings, and monitor server health. The first <strong>{{freeTierLimit}}</strong> people on your server get to use Stirling free of charge."
      />
    </span>
  );

  return {
    key: isAdmin ? 'admin-overview' : 'plan-overview',
    title: isAdmin 
      ? t('onboarding.planOverview.adminTitle', 'Admin Overview')
      : t('onboarding.planOverview.userTitle', 'Plan Overview'),
    body: isAdmin ? adminBody : (
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

