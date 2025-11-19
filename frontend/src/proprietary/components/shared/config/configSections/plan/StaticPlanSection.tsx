import React, { useState, useEffect } from 'react';
import { Card, Text, Group, Stack, Badge, Button, Collapse, Alert, TextInput, Paper, Loader, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { alert } from '@app/components/toast';
import { LicenseInfo } from '@app/services/licenseService';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
}

interface StaticPlanSectionProps {
  currentLicenseInfo?: LicenseInfo;
}

const StaticPlanSection: React.FC<StaticPlanSectionProps> = ({ currentLicenseInfo }) => {
  const { t } = useTranslation();
  const [showLicenseKey, setShowLicenseKey] = useState(false);

  // Premium/License key management
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const {
    settings: premiumSettings,
    setSettings: setPremiumSettings,
    loading: premiumLoading,
    saving: premiumSaving,
    fetchSettings: fetchPremiumSettings,
    saveSettings: savePremiumSettings,
    isFieldPending,
  } = useAdminSettings<PremiumSettingsData>({
    sectionName: 'premium',
  });

  useEffect(() => {
    fetchPremiumSettings();
  }, []);

  const handleSaveLicense = async () => {
    try {
      await savePremiumSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const staticPlans = [
    {
      id: 'free',
      name: t('plan.free.name', 'Free'),
      price: 0,
      currency: '£',
      period: t('plan.period.month', '/month'),
      highlights: [
        t('plan.free.highlight1', 'Limited Tool Usage Per week'),
        t('plan.free.highlight2', 'Access to all tools'),
        t('plan.free.highlight3', 'Community support'),
      ],
      features: [
        { name: t('plan.feature.pdfTools', 'Basic PDF Tools'), included: true },
        { name: t('plan.feature.fileSize', 'File Size Limit'), included: false },
        { name: t('plan.feature.automation', 'Automate tool workflows'), included: false },
        { name: t('plan.feature.api', 'API Access'), included: false },
        { name: t('plan.feature.priority', 'Priority Support'), included: false },
      ],
      maxUsers: 5,
    },
    {
      id: 'pro',
      name: t('plan.pro.name', 'Pro'),
      price: 8,
      currency: '£',
      period: t('plan.period.perUserPerMonth', '/user/month'),
      popular: true,
      highlights: [
        t('plan.pro.highlight1', 'Unlimited Tool Usage per user'),
        t('plan.pro.highlight2', 'Advanced PDF tools'),
        t('plan.pro.highlight3', 'No watermarks'),
      ],
      features: [
        { name: t('plan.feature.pdfTools', 'Basic PDF Tools'), included: true },
        { name: t('plan.feature.fileSize', 'File Size Limit'), included: true },
        { name: t('plan.feature.automation', 'Automate tool workflows'), included: true },
        { name: t('plan.feature.api', 'Weekly API Credits'), included: true },
        { name: t('plan.feature.priority', 'Priority Support'), included: false },
      ],
      maxUsers: 'Unlimited users',
    },
    {
      id: 'enterprise',
      name: t('plan.enterprise.name', 'Enterprise'),
      price: 0,
      currency: '',
      period: '',
      highlights: [
        t('plan.enterprise.highlight1', 'Custom pricing'),
        t('plan.enterprise.highlight2', 'Dedicated support'),
        t('plan.enterprise.highlight3', 'Latest features'),
      ],
      features: [
        { name: t('plan.feature.pdfTools', 'Basic PDF Tools'), included: true },
        { name: t('plan.feature.fileSize', 'File Size Limit'), included: true },
        { name: t('plan.feature.automation', 'Automate tool workflows'), included: true },
        { name: t('plan.feature.api', 'Weekly API Credits'), included: true },
        { name: t('plan.feature.priority', 'Priority Support'), included: true },
      ],
      maxUsers: 'Custom',
    },
  ];

  const getCurrentPlan = () => {
    if (!currentLicenseInfo) return staticPlans[0];
    if (currentLicenseInfo.licenseType === 'ENTERPRISE') return staticPlans[2];
    if (currentLicenseInfo.maxUsers > 5) return staticPlans[1];
    return staticPlans[0];
  };

  const currentPlan = getCurrentPlan();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Current Plan Section */}
      <div>
        <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
          {t('plan.activePlan.title', 'Active Plan')}
        </h3>
        <p
          style={{
            margin: '0.25rem 0 1rem 0',
            color: 'var(--mantine-color-dimmed)',
            fontSize: '0.875rem',
          }}
        >
          {t('plan.activePlan.subtitle', 'Your current subscription details')}
        </p>

        <Card padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="center">
            <Stack gap="xs">
              <Group gap="sm">
                <Text size="lg" fw={600}>
                  {currentPlan.name}
                </Text>
                <Badge color="green" variant="light">
                  {t('subscription.status.active', 'Active')}
                </Badge>
              </Group>
              {currentLicenseInfo && (
                <Text size="sm" c="dimmed">
                  {t('plan.static.maxUsers', 'Max Users')}: {currentLicenseInfo.maxUsers}
                </Text>
              )}
            </Stack>
            <div style={{ textAlign: 'right' }}>
              <Text size="xl" fw={700}>
                {currentPlan.price === 0 ? t('plan.free.name', 'Free') : `${currentPlan.currency}${currentPlan.price}${currentPlan.period}`}
              </Text>
            </div>
          </Group>
        </Card>
      </div>

      {/* Available Plans */}
      <div>
        <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
          {t('plan.availablePlans.title', 'Available Plans')}
        </h3>
        <p
          style={{
            margin: '0.25rem 0 1rem 0',
            color: 'var(--mantine-color-dimmed)',
            fontSize: '0.875rem',
          }}
        >
          {t('plan.static.contactToUpgrade', 'Contact us to upgrade or customize your plan')}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            paddingBottom: '1rem',
          }}
        >
          {staticPlans.map((plan) => (
            <Card
              key={plan.id}
              padding="lg"
              radius="md"
              withBorder
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {plan.popular && (
                <Badge
                  variant="filled"
                  size="xs"
                  style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                >
                  {t('plan.popular', 'Popular')}
                </Badge>
              )}

              <Stack gap="md" style={{ height: '100%' }}>
                <div>
                  <Text size="lg" fw={600}>
                    {plan.name}
                  </Text>
                  <Group gap="xs" style={{ alignItems: 'baseline' }}>
                    <Text size="xl" fw={700} style={{ fontSize: '2rem' }}>
                      {plan.price === 0 && plan.id !== 'free'
                        ? t('plan.customPricing', 'Custom')
                        : plan.price === 0
                          ? t('plan.free.name', 'Free')
                          : `${plan.currency}${plan.price}`}
                    </Text>
                    {plan.period && (
                      <Text size="sm" c="dimmed">
                        {plan.period}
                      </Text>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" mt="xs">
                    {typeof plan.maxUsers === 'string'
                      ? plan.maxUsers
                      : `${t('plan.static.upTo', 'Up to')} ${plan.maxUsers} ${t('workspace.people.license.users', 'users')}`}
                  </Text>
                </div>

                <Stack gap="xs">
                  {plan.highlights.map((highlight, index) => (
                    <Text key={index} size="sm" c="dimmed">
                      • {highlight}
                    </Text>
                  ))}
                </Stack>

                <div style={{ flexGrow: 1 }} />

                <Button
                  variant={plan.id === currentPlan.id ? 'filled' : 'outline'}
                  disabled={plan.id === currentPlan.id}
                  fullWidth
                  onClick={() =>
                    window.open('https://www.stirling.com/contact', '_blank')
                  }
                >
                  {plan.id === currentPlan.id
                    ? t('plan.current', 'Current Plan')
                    : t('plan.contact', 'Contact Us')}
                </Button>
              </Stack>
            </Card>
          ))}
        </div>
      </div>

      <Divider />

      {/* License Key Section */}
      <div>
        <Button
          variant="subtle"
          leftSection={<LocalIcon icon={showLicenseKey ? "expand-less-rounded" : "expand-more-rounded"} width="1.25rem" height="1.25rem" />}
          onClick={() => setShowLicenseKey(!showLicenseKey)}
        >
          {t('admin.settings.premium.licenseKey.toggle', 'Got a license key or certificate file?')}
        </Button>

        <Collapse in={showLicenseKey} mt="md">
          <Stack gap="md">
            <Alert
              variant="light"
              color="blue"
              icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
            >
              <Text size="sm">
                {t('admin.settings.premium.licenseKey.info', 'If you have a license key or certificate file from a direct purchase, you can enter it here to activate premium or enterprise features.')}
              </Text>
            </Alert>

            {premiumLoading ? (
              <Stack align="center" justify="center" h={100}>
                <Loader size="md" />
              </Stack>
            ) : (
              <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                  <div>
                    <TextInput
                      label={
                        <Group gap="xs">
                          <span>{t('admin.settings.premium.key.label', 'License Key')}</span>
                          <PendingBadge show={isFieldPending('key')} />
                        </Group>
                      }
                      description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key. Premium features will be automatically enabled when a key is provided.')}
                      value={premiumSettings.key || ''}
                      onChange={(e) => setPremiumSettings({ ...premiumSettings, key: e.target.value })}
                      placeholder="00000000-0000-0000-0000-000000000000"
                    />
                  </div>

                  <Group justify="flex-end">
                    <Button onClick={handleSaveLicense} loading={premiumSaving} size="sm">
                      {t('admin.settings.save', 'Save Changes')}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Collapse>
      </div>

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
};

export default StaticPlanSection;
