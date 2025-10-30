import React from 'react';
import { Card, Text, Group, Stack, Badge, Button, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';

interface StaticPlanSectionProps {
  currentLicenseInfo?: {
    planName: string;
    maxUsers: number;
    grandfathered: boolean;
  };
}

const StaticPlanSection: React.FC<StaticPlanSectionProps> = ({ currentLicenseInfo }) => {
  const { t } = useTranslation();

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
      period: t('plan.period.month', '/month'),
      popular: true,
      highlights: [
        t('plan.pro.highlight1', 'Unlimited Tool Usage'),
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
      maxUsers: 'Unlimited',
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
    if (currentLicenseInfo.planName === 'Enterprise') return staticPlans[2];
    if (currentLicenseInfo.maxUsers > 5) return staticPlans[1];
    return staticPlans[0];
  };

  const currentPlan = getCurrentPlan();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Stripe Not Configured Alert */}
      <Alert color="blue" title={t('plan.static.title', 'Billing Information')}>
        <Stack gap="sm">
          <Text size="sm">
            {t(
              'plan.static.message',
              'Online billing is not currently configured. To upgrade your plan or manage subscriptions, please contact us directly.'
            )}
          </Text>
          <Button
            variant="light"
            leftSection={<LocalIcon icon="email" width="1rem" height="1rem" />}
            onClick={() =>
              window.open('mailto:sales@stirlingpdf.com?subject=License Upgrade Inquiry', '_blank')
            }
            style={{ width: 'fit-content' }}
          >
            {t('plan.static.contactSales', 'Contact Sales')}
          </Button>
        </Stack>
      </Alert>

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
                  {currentLicenseInfo.grandfathered &&
                    ` (${t('workspace.people.license.grandfathered', 'Grandfathered')})`}
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
                    window.open(
                      `mailto:sales@stirlingpdf.com?subject=Upgrade to ${plan.name} Plan`,
                      '_blank'
                    )
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
    </div>
  );
};

export default StaticPlanSection;
