import React from 'react';
import { SlideConfig } from './types';
import styles from '../InitialOnboardingModal/InitialOnboardingModal.module.css';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

export default function WelcomeSlide(): SlideConfig {
  return {
    key: 'welcome',
    title: (
      <span className={styles.welcomeTitleContainer}>
        Welcome to Stirling
        <span className={styles.v2Badge}>
          V2
        </span>
      </span>
    ),
    body: (
      <span>
        Stirling helps you read and edit PDFs privately. The app includes a simple <strong>Reader</strong> with basic editing tools and an advanced <strong>Editor</strong> with professional editing tools.
      </span>
    ),
    background: {
      gradientStops: ['#7C3AED', '#EC4899'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

