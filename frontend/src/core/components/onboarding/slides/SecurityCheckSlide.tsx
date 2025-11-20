import React from 'react';
import { Select } from '@mantine/core';
import styles from '../InitialOnboardingModal/InitialOnboardingModal.module.css';
import { SlideConfig } from './types';
import LocalIcon from '@app/components/shared/LocalIcon';
import { UNIFIED_CIRCLE_CONFIG } from './unifiedBackgroundConfig';
import i18n from '@app/i18n';

interface SecurityCheckSlideProps {
  selectedRole: 'admin' | 'user' | null;
  onRoleSelect: (role: 'admin' | 'user' | null) => void;
}

export default function SecurityCheckSlide({
  selectedRole,
  onRoleSelect,
}: SecurityCheckSlideProps): SlideConfig {
  return {
    key: 'security-check',
    title: 'Security Check',
    body: (
      <div className={styles.securitySlideContent}>
        <div className={styles.securityCard}>
          <div className={styles.securityAlertRow}>
            <LocalIcon icon="error" width={20} height={20} style={{ color: '#F04438', flexShrink: 0 }} />
            <span>{i18n.t('onboarding.securityCheck.message', 'The application has undergone significant changes recently. Your server admin\'s attention may be required. Please confirm your role to continue.')}</span>
          </div>

          <Select
            placeholder="Confirm your role"
            value={selectedRole}
            data={[
              { value: 'admin', label: 'Admin' },
              { value: 'user', label: 'User' },
            ]}
            onChange={(value) => onRoleSelect((value as 'admin' | 'user') ?? null)}
            comboboxProps={{ withinPortal: true, zIndex: 5000 }}
            styles={{
              input: {
                height: 48,
                fontSize: 15,
              },
            }}
          />
        </div>
      </div>
    ),
    background: {
      gradientStops: ['#5B21B6', '#2563EB'],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}


