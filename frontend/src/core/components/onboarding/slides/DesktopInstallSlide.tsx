import React from 'react';
import { SlideConfig } from './types';

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
      circles: [
        {
          position: 'bottom-left',
          size: 260,
          color: 'rgba(255, 255, 255, 0.2)',
          opacity: 0.88,
          amplitude: 24,
          duration: 11,
          offsetX: 16,
          offsetY: 12,
        },
        {
          position: 'top-right',
          size: 300,
          color: 'rgba(28, 155, 235, 0.34)',
          opacity: 0.86,
          amplitude: 28,
          duration: 12,
          delay: 1,
          offsetX: 20,
          offsetY: 16,
        },
      ],
    },
  };
}

