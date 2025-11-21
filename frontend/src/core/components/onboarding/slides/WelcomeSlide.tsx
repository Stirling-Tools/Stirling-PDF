import React from 'react';
import { Trans } from 'react-i18next';
import { SlideConfig } from './types';
import styles from '../InitialOnboardingModal/InitialOnboardingModal.module.css';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';
import i18n from '@app/i18n';

export default function WelcomeSlide(): SlideConfig {
  return {
    key: 'welcome',
    title: (
      <span className={styles.welcomeTitleContainer}>
        {i18n.t('onboarding.welcomeSlide.title', 'Welcome to Stirling')}
        <span className={styles.v2Badge}>
          V2
        </span>
      </span>
    ),
    body: (
      <span>
        <Trans
          i18nKey="onboarding.welcomeSlide.body"
          components={{
            strong: <strong />,
            br: <br />,
          }}
          defaults="Stirling PDF is now ready for teams of all sizes.<br />This update includes a new layout, powerful new admin capabilities, and our most requested feature - <strong>Edit Text</strong>."
        />
      </span>
    ),
    background: {
      gradientStops: ['#7C3AED', '#EC4899'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

