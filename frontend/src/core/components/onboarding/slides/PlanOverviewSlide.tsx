import React from 'react';
import { SlideConfig, LicenseNotice } from './types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface PlanOverviewSlideProps {
  isAdmin: boolean;
  licenseNotice?: LicenseNotice;
}

const DEFAULT_FREE_TIER_LIMIT = 5;

export default function PlanOverviewSlide({ isAdmin, licenseNotice }: PlanOverviewSlideProps): SlideConfig {
  const freeTierLimit = licenseNotice?.freeTierLimit ?? DEFAULT_FREE_TIER_LIMIT;

  const adminBody = (
    <span>
      As an admin, you can manage users, configure settings, and monitor server health. The first{' '}
      <strong>{freeTierLimit}</strong> people on your server get to use Stirling free of charge.
    </span>
  );

  return {
    key: isAdmin ? 'admin-overview' : 'plan-overview',
    title: isAdmin ? 'Admin Overview' : 'Plan Overview',
    body: isAdmin ? adminBody : (
      <span>
        Invite teammates, assign roles, and keep your documents organized in one secure workspace. Enable login mode whenever you're ready to grow beyond solo use.
      </span>
    ),
    background: {
      gradientStops: isAdmin ? ['#4F46E5', '#0EA5E9'] : ['#F97316', '#EF4444'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

