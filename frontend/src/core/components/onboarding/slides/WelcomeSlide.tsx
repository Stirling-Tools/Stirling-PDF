import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { SlideConfig } from '../../../types/types';
import styles from '../InitialOnboardingModal/InitialOnboardingModal.module.css';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

export default function WelcomeSlide(): SlideConfig {
  const { t } = useTranslation();

  return {
    key: 'welcome',
    title: (
      <span className={styles.welcomeTitleContainer}>
        {t('onboarding.welcomeSlide.title', 'Welcome to Stirling')}
        <span className={styles.v2Badge}>
          V2
        </span>
      </span>
    ),
    body: (
      <span>
        <Trans
          i18nKey="onboarding.welcomeSlide.body"
          components={{ strong: <strong /> }}
          defaults="Stirling PDF is now ready for teams of all sizes. This update includes a new layout, powerful new admin capabilities, and our most requested feature - <strong>Edit Text</strong>."
        />
      </span>
    ),
    background: {
      gradientStops: ['#7C3AED', '#EC4899'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

