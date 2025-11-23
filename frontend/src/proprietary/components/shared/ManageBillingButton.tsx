import React, { useState } from 'react';
import { Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import licenseService from '@app/services/licenseService';
import { alert } from '@app/components/toast';

interface ManageBillingButtonProps {
  returnUrl?: string;
}

export const ManageBillingButton: React.FC<ManageBillingButtonProps> = ({
  returnUrl = window.location.href,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);

      // Get current license key for authentication
      const licenseInfo = await licenseService.getLicenseInfo();

      if (!licenseInfo.licenseKey) {
        throw new Error('No license key found. Please activate a license first.');
      }

      // Create billing portal session with license key
      const response = await licenseService.createBillingPortalSession(
        returnUrl,
        licenseInfo.licenseKey
      );

      // Open billing portal in new tab
      window.open(response.url, '_blank');
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to open billing portal:', error);
      alert({
        alertType: 'error',
        title: t('billing.portal.error', 'Failed to open billing portal'),
        body: error.message || 'Please try again or contact support.',
      });
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleClick} loading={loading}>
      {t('billing.manageBilling', 'Manage Billing')}
    </Button>
  );
};
