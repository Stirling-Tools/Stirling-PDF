import React from 'react';
import { useTranslation } from 'react-i18next';
import { SlideConfig } from '../../../types/types';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';
import { DesktopInstallTitle, type OSOption } from './DesktopInstallTitle';

export type { OSOption };

interface DesktopInstallSlideProps {
  osLabel: string;
  osUrl: string;
  osOptions?: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
}

export default function DesktopInstallSlide({ osLabel, osUrl, osOptions = [], onDownloadUrlChange }: DesktopInstallSlideProps): SlideConfig {
  const { t } = useTranslation();

  return {
    key: 'desktop-install',
    title: (
      <DesktopInstallTitle 
        osLabel={osLabel}
        osUrl={osUrl}
        osOptions={osOptions || []}
        onDownloadUrlChange={onDownloadUrlChange}
      />
    ),
    body: (
      <span>
        {t('onboarding.desktopInstall.body', 'Stirling works best as a desktop app. You can use it offline, access documents faster, and make edits locally on your computer.')}
      </span>
    ),
    downloadUrl: osUrl,
    background: {
      gradientStops: ['#2563EB', '#0EA5E9'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

