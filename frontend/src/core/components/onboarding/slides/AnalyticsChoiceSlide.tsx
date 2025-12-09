import React from 'react';
import { Trans } from 'react-i18next';
import i18n from '@app/i18n';
import { SlideConfig } from '@app/types/types';
import { UNIFIED_CIRCLE_CONFIG } from '@app/components/onboarding/slides/unifiedBackgroundConfig';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';

interface AnalyticsChoiceSlideProps {
  analyticsError?: string | null;
}

export default function AnalyticsChoiceSlide({ analyticsError }: AnalyticsChoiceSlideProps): SlideConfig {
  return {
    key: 'analytics-choice',
    title: i18n.t('analytics.title', 'Help improve Stirling PDF?'),
    body: (
      <div className={styles.bodyCopyInner}>
        <Trans
          i18nKey="analytics.paragraph1"
          defaults="Stirling PDF uses optional, privacy-respecting analytics to guide improvements."
          components={{ strong: <strong /> }}
        />
        <br />
        <Trans
          i18nKey="analytics.paragraph2"
          defaults="We never track personal information or file contents. You can change this later in settings."
          components={{ strong: <strong /> }}
        />
        {analyticsError && (
          <div style={{ color: 'var(--mantine-color-red-6)', marginTop: 12 }}>
            {analyticsError}
          </div>
        )}
      </div>
    ),
    background: {
      gradientStops: ['#0EA5E9', '#6366F1'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

