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
      const response = await licenseService.createBillingPortalSession(returnUrl);
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      alert({
        alertType: 'error',
        title: t('billing.portal.error', 'Failed to open billing portal'),
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
