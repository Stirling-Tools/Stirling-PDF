import React from 'react';
import { Trans } from 'react-i18next';
import { SlideConfig, LicenseNotice } from '../../../types/types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';
import i18n from '@app/i18n';

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
  const title = isOverLimit
    ? i18n.t('onboarding.serverLicense.overLimitTitle', 'Server License Needed')
    : i18n.t('onboarding.serverLicense.freeTitle', 'Server License');
  const key = isOverLimit ? 'server-license-over-limit' : 'server-license';

  const overLimitBody = (
    <Trans
      i18nKey="onboarding.serverLicense.overLimitBody"
      values={{ freeTierLimit, overLimitUserCopy }}
      components={{
        strong: <strong />,
      }}
      defaults="Our licensing permits up to <strong>{{freeTierLimit}}</strong> users for free per server. You have <strong>{{overLimitUserCopy}}</strong> Stirling users. To continue uninterrupted, upgrade to the Stirling Server plan - <strong>unlimited seats</strong>, PDF text editing, and full admin control for $99/server/mo."
    />
  );

  const freeBody = (
    <Trans
      i18nKey="onboarding.serverLicense.freeBody"
      values={{ freeTierLimit }}
      components={{
        strong: <strong />,
      }}
      defaults="Our <strong>Open-Core</strong> licensing permits up to <strong>{{freeTierLimit}}</strong> users for free per server. To scale uninterrupted and get early access to our new <strong>PDF text editing tool</strong>, we recommend the Stirling Server plan - full editing and <strong>unlimited seats</strong> for $99/server/mo."
    />
  );

  const body = isOverLimit ? overLimitBody : freeBody;

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


