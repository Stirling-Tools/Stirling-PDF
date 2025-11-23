import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SlideConfig, LicenseNotice } from '../../../types/types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface PlanOverviewSlideProps {
  isAdmin: boolean;
  licenseNotice?: LicenseNotice;
  loginEnabled?: boolean;
}

const DEFAULT_FREE_TIER_LIMIT = 5;

const PlanOverviewTitle: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  return (
    <>
      {isAdmin
        ? t('onboarding.planOverview.adminTitle', 'Admin Overview')
        : t('onboarding.planOverview.userTitle', 'Plan Overview')}
    </>
  );
};

const AdminOverviewBody: React.FC<{ freeTierLimit: number; loginEnabled: boolean }> = ({
  freeTierLimit,
  loginEnabled,
}) => {
  const adminBodyKey = loginEnabled
    ? 'onboarding.planOverview.adminBodyLoginEnabled'
    : 'onboarding.planOverview.adminBodyLoginDisabled';

  const defaultValue = loginEnabled
    ? 'As an admin, you can manage users, configure settings, and monitor server health. The first <strong>{{freeTierLimit}}</strong> people on your server get to use Stirling free of charge.'
    : 'Once you enable login mode, you can manage users, configure settings, and monitor server health. The first <strong>{{freeTierLimit}}</strong> people on your server get to use Stirling free of charge.';

  return (
    <Trans
      i18nKey={adminBodyKey}
      values={{ freeTierLimit }}
      components={{ strong: <strong /> }}
      defaults={defaultValue}
    />
  );
};

const UserOverviewBody: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span>
      {t(
        'onboarding.planOverview.userBody',
        "Invite teammates, assign roles, and keep your documents organized in one secure workspace. Enable login mode whenever you're ready to grow beyond solo use.",
      )}
    </span>
  );
};

const PlanOverviewBody: React.FC<{ isAdmin: boolean; freeTierLimit: number; loginEnabled: boolean }> = ({
  isAdmin,
  freeTierLimit,
  loginEnabled,
}) =>
  isAdmin ? <AdminOverviewBody freeTierLimit={freeTierLimit} loginEnabled={loginEnabled} /> : <UserOverviewBody />;

export default function PlanOverviewSlide({
  isAdmin,
  licenseNotice,
  loginEnabled = false,
}: PlanOverviewSlideProps): SlideConfig {
  const freeTierLimit = licenseNotice?.freeTierLimit ?? DEFAULT_FREE_TIER_LIMIT;

  return {
    key: isAdmin ? 'admin-overview' : 'plan-overview',
    title: <PlanOverviewTitle isAdmin={isAdmin} />,
    body: <PlanOverviewBody isAdmin={isAdmin} freeTierLimit={freeTierLimit} loginEnabled={loginEnabled} />,
    background: {
      gradientStops: isAdmin ? ['#4F46E5', '#0EA5E9'] : ['#F97316', '#EF4444'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

