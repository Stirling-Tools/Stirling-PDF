import React from 'react';
import { SlideConfig } from './types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';

interface DesktopInstallSlideProps {
  osLabel: string;
  osUrl: string;
}

export default function DesktopInstallSlide({ osLabel, osUrl }: DesktopInstallSlideProps): SlideConfig {
  const title = osLabel ? `Download for ${osLabel}` : 'Download';

  return {
    key: 'desktop-install',
    title,
    body: (
      <span>
        Stirling works best as a desktop app. You can use it offline, access documents faster, and make edits locally on your computer.
      </span>
    ),
    downloadUrl: osUrl,
    background: {
      gradientStops: ['#2563EB', '#0EA5E9'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

