import React from 'react';
import { SlideConfig, LicenseNotice } from './types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface ServerLicenseSlideProps {
  licenseNotice?: LicenseNotice;
}

const DEFAULT_FREE_TIER_LIMIT = 5;

export default function ServerLicenseSlide({ licenseNotice }: ServerLicenseSlideProps = {}): SlideConfig {
  const freeTierLimit = licenseNotice?.freeTierLimit ?? DEFAULT_FREE_TIER_LIMIT;
  const totalUsers = licenseNotice?.totalUsers ?? null;
  const isOverLimit = licenseNotice?.isOverLimit ?? false;
  const formattedTotalUsers = totalUsers != null ? totalUsers.toLocaleString() : null;
  const overLimitUserCopy = formattedTotalUsers ?? `more than ${freeTierLimit}`;
  const title = isOverLimit ? 'Server License Needed' : 'Server License';
  const key = isOverLimit ? 'server-license-over-limit' : 'server-license';

  const body = isOverLimit ? (
    <span>
      Our licensing permits up to <strong>{freeTierLimit}</strong> users for free per server. You have{' '}
      <strong>{overLimitUserCopy}</strong> Stirling users. To continue uninterrupted, upgrade to the Stirling Server
      plan - unlimited seats, PDF text editing, and full admin control for $99/server/mo.
    </span>
  ) : (
    <span>
      Our licensing permits up to <strong>{freeTierLimit}</strong> users for free per server. To scale uninterrupted
      and access our new PDF text editing tool, we recommend the Stirling Server plan - full editing and unlimited
      seats for $99/server/mo.
    </span>
  );

  return {
    key,
    title,
    body,
    background: {
      gradientStops: isOverLimit ? ['#F472B6', '#8B5CF6'] : ['#F97316', '#F59E0B'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}


