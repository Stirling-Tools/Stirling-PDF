import React from 'react';
import { Stack, Button, Title, Text, Grid, Paper, Badge, Alert, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTierGroup } from '@app/services/licenseService';
import { SavingsCalculation } from '../types/checkout';

interface PlanSelectionStageProps {
  planGroup: PlanTierGroup;
  minimumSeats: number;
  savings: SavingsCalculation | null;
  canGoBack: boolean;
  onBack: () => void;
  onSelectPlan: (period: 'monthly' | 'yearly') => void;
}

export const PlanSelectionStage: React.FC<PlanSelectionStageProps> = ({
  planGroup,
  minimumSeats,
  savings,
  canGoBack,
  onBack,
  onSelectPlan,
}) => {
  const { t } = useTranslation();
  const isEnterprise = planGroup.tier === 'enterprise';
  const seatCount = minimumSeats || 1;

  return (
    <Stack gap="lg" style={{ padding: '1rem 0' }}>
      {/* Back button */}
      {canGoBack && (
        <Button variant="subtle" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← {t('common.back', 'Back')}
        </Button>
      )}

      <div>
        <Title order={3} mb="xs">
          {t('payment.planStage.title', 'Choose Your Billing Period')}
        </Title>
        <Text size="sm" c="dimmed">
          {savings && t('payment.planStage.savingsNote', 'Save {{percent}}% with annual billing', { percent: savings.percent })}
        </Text>
      </div>

      <Grid gutter="xl" style={{ marginTop: '1rem' }}>
        {/* Monthly Option */}
        {planGroup.monthly && (
          <Grid.Col span={6}>
            <Paper
              withBorder
              p="xl"
              radius="md"
              style={{
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '100%',
                position: 'relative',
              }}
              onClick={() => onSelectPlan('monthly')}
            >
              <Stack gap="md">
                <Text size="lg" fw={600}>
                  {t('payment.monthly', 'Monthly')}
                </Text>

                <Divider />

                {isEnterprise && planGroup.monthly.seatPrice ? (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.basePrice', 'Base Price')}
                      </Text>
                      <Text size="xl" fw={700}>
                        {planGroup.monthly.currency}{planGroup.monthly.price.toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /month</Text>
                      </Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.seatPrice', 'Per Seat')}
                      </Text>
                      <Text size="xl" fw={700}>
                        {planGroup.monthly.currency}{planGroup.monthly.seatPrice.toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /seat/month</Text>
                      </Text>
                    </div>
                    <Divider />
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.totalForSeats', 'Total ({{count}} seats)', { count: seatCount })}
                      </Text>
                      <Text size="2rem" fw={700}>
                        {planGroup.monthly.currency}{(planGroup.monthly.price + (planGroup.monthly.seatPrice * seatCount)).toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /month</Text>
                      </Text>
                    </div>
                  </>
                ) : (
                  <div>
                    <Text size="3rem" fw={700} style={{ lineHeight: 1 }}>
                      {planGroup.monthly?.currency}{planGroup.monthly?.price.toFixed(2)}
                    </Text>
                    <Text size="sm" c="dimmed" mt="xs">
                      {t('payment.perMonth', '/month')}
                    </Text>
                  </div>
                )}

                <Button variant="light" fullWidth size="lg" mt="md">
                  {t('payment.planStage.selectMonthly', 'Select Monthly')}
                </Button>
              </Stack>
            </Paper>
          </Grid.Col>
        )}

        {/* Yearly Option */}
        {planGroup.yearly && (
          <Grid.Col span={6}>
            <Paper
              withBorder
              p="xl"
              radius="md"
              style={{
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '100%',
                position: 'relative',
                borderColor: savings ? 'var(--mantine-color-green-6)' : undefined,
                borderWidth: savings ? '2px' : undefined,
              }}
              onClick={() => onSelectPlan('yearly')}
            >
              {savings && (
                <Badge
                  color="green"
                  variant="filled"
                  size="lg"
                  style={{ position: 'absolute', top: '1rem', right: '1rem' }}
                >
                  {t('payment.planStage.savePercent', 'Save {{percent}}%', { percent: savings.percent })}
                </Badge>
              )}

              <Stack gap="md">
                <Text size="lg" fw={600}>
                  {t('payment.yearly', 'Yearly')}
                </Text>

                <Divider />

                {isEnterprise && planGroup.yearly.seatPrice ? (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.basePrice', 'Base Price')}
                      </Text>
                      <Text size="xl" fw={700}>
                        {planGroup.yearly.currency}{planGroup.yearly.price.toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /year</Text>
                      </Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.seatPrice', 'Per Seat')}
                      </Text>
                      <Text size="xl" fw={700}>
                        {planGroup.yearly.currency}{planGroup.yearly.seatPrice.toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /seat/year</Text>
                      </Text>
                    </div>
                    <Divider />
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('payment.planStage.totalForSeats', 'Total ({{count}} seats)', { count: seatCount })}
                      </Text>
                      <Text size="2rem" fw={700}>
                        {planGroup.yearly.currency}{(planGroup.yearly.price + (planGroup.yearly.seatPrice * seatCount)).toFixed(2)}
                        <Text component="span" size="sm" c="dimmed" fw={400}> /year</Text>
                      </Text>
                    </div>
                  </>
                ) : (
                  <div>
                    <Text size="3rem" fw={700} style={{ lineHeight: 1 }}>
                      {planGroup.yearly?.currency}{planGroup.yearly?.price.toFixed(2)}
                    </Text>
                    <Text size="sm" c="dimmed" mt="xs">
                      {t('payment.perYear', '/year')}
                    </Text>
                  </div>
                )}

                {savings && (
                  <Alert color="green" variant="light" p="sm">
                    <Text size="sm" fw={600}>
                      {t('payment.planStage.savingsAmount', 'You save {{currency}}{{amount}}', {
                        currency: savings.currency,
                        amount: savings.amount.toFixed(2)
                      })}
                    </Text>
                  </Alert>
                )}

                <Button variant="filled" fullWidth size="lg" mt="md">
                  {t('payment.planStage.selectYearly', 'Select Yearly')}
                </Button>
              </Stack>
            </Paper>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
};
