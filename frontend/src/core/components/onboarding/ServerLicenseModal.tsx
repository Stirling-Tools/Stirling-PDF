import React from 'react';
import { Modal, Button, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AnimatedSlideBackground from '@app/components/onboarding/slides/AnimatedSlideBackground';
import ServerLicenseSlide from '@app/components/onboarding/slides/ServerLicenseSlide';
import { LicenseNotice } from '@app/types/types';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import { BASE_PATH } from '@app/constants/app';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';

interface ServerLicenseModalProps {
  opened: boolean;
  onClose: () => void;
  onSeePlans?: () => void;
  licenseNotice: LicenseNotice;
}

export default function ServerLicenseModal({
  opened,
  onClose,
  onSeePlans,
  licenseNotice,
}: ServerLicenseModalProps) {
  const { t } = useTranslation();
  const slide = React.useMemo(() => ServerLicenseSlide({ licenseNotice }), [licenseNotice]);
  const primaryLabel = licenseNotice.isOverLimit
    ? t('onboarding.serverLicense.upgrade', 'Upgrade now →')
    : t('onboarding.serverLicense.seePlans', 'See Plans →');
  const secondaryLabel = t('onboarding.serverLicense.skip', 'Skip for now');

  const handleSeePlans = () => {
    onSeePlans?.();
    onClose();
  };

  const secondaryStyles = {
    root: {
      background: 'var(--onboarding-secondary-button-bg)',
      border: '1px solid var(--onboarding-secondary-button-border)',
      color: 'var(--onboarding-secondary-button-text)',
    },
  };

  const primaryStyles = {
    root: {
      background: 'var(--onboarding-primary-button-bg)',
      color: 'var(--onboarding-primary-button-text)',
    },
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0 },
        content: { overflow: 'hidden', border: 'none', background: 'var(--bg-surface)' },
      }}
    >
      <Stack gap={0}>
        <div className={styles.heroWrapper}>
          <AnimatedSlideBackground
            gradientStops={slide.background.gradientStops}
            circles={slide.background.circles}
            isActive
            slideKey={slide.key}
          />
          <div className={styles.heroLogo}>
            <div className={styles.heroIconsContainer}>
              <div className={styles.iconWrapper}>
                <img src={`${BASE_PATH}/modern-logo/logo512.png`} alt="Stirling icon" className={styles.downloadIcon} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <Stack gap={16}>
            <div
              className={styles.title}
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontWeight: 600,
                fontSize: 22,
                color: 'var(--onboarding-title)',
              }}
            >
              {slide.title}
            </div>
            <div
              className={styles.bodyCopy}
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontSize: 16,
                color: 'var(--onboarding-body)',
                lineHeight: 1.5,
              }}
            >
              {slide.body}
            </div>
            <Group justify="space-between">
              <Button styles={secondaryStyles} onClick={onClose}>
                {secondaryLabel}
              </Button>
              <Button styles={primaryStyles} onClick={handleSeePlans}>
                {primaryLabel}
              </Button>
            </Group>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}

