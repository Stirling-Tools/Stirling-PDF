import React from 'react';
import { Stack, Button, Text, Grid, Paper, Alert, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTierGroup } from '@app/services/licenseService';
import { SavingsCalculation } from '@app/components/shared/stripeCheckout/types/checkout';
import { PricingBadge } from '@app/components/shared/stripeCheckout/components/PricingBadge';
import { PriceDisplay } from '@app/components/shared/stripeCheckout/components/PriceDisplay';
import { formatPrice, calculateMonthlyEquivalent, calculateTotalWithSeats } from '@app/components/shared/stripeCheckout/utils/pricingUtils';
import { getClickablePaperStyle } from '@app/components/shared/stripeCheckout/utils/cardStyles';

interface PlanSelectionStageProps {
  planGroup: PlanTierGroup;
  minimumSeats: number;
  savings: SavingsCalculation | null;
  onSelectPlan: (period: 'monthly' | 'yearly') => void;
}

export const PlanSelectionStage: React.FC<PlanSelectionStageProps> = ({
  planGroup,
  minimumSeats,
  savings,
  onSelectPlan,
}) => {
  const { t } = useTranslation();
  const isEnterprise = planGroup.tier === 'enterprise';
  const seatCount = minimumSeats || 1;

  return (
    <Stack gap="lg" style={{ padding: '1rem 2rem' }}>

        <Grid gutter="xl" style={{ marginTop: '1rem' }}>
        {/* Monthly Option */}
        {planGroup.monthly && (
          <Grid.Col span={6}>
            <Paper
              withBorder
              p="xl"
              radius="md"
              style={getClickablePaperStyle()}
              onClick={() => onSelectPlan('monthly')}
            >
              <Stack gap="md" style={{ height: '100%' }} justify="space-between">
                <Text size="lg" fw={600}>
                  {t('payment.monthly', 'Monthly')}
                </Text>

                <Divider />

                {isEnterprise && planGroup.monthly.seatPrice ? (
                  <PriceDisplay
                    mode="enterprise"
                    basePrice={planGroup.monthly.price}
                    seatPrice={planGroup.monthly.seatPrice}
                    totalPrice={calculateTotalWithSeats(planGroup.monthly.price, planGroup.monthly.seatPrice, seatCount)}
                    currency={planGroup.monthly.currency}
                    period="month"
                    seatCount={seatCount}
                    size="sm"
                  />
                ) : (
                  <PriceDisplay
                    mode="simple"
                    price={planGroup.monthly?.price || 0}
                    currency={planGroup.monthly?.currency || '£'}
                    period={t('payment.perMonth', '/month')}
                    size="2.5rem"
                  />
                )}

                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                  <Button variant="light" fullWidth size="lg">
                    {t('payment.planStage.selectMonthly', 'Select Monthly')}
                  </Button>
                </div>
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
              style={getClickablePaperStyle(!!savings)}
              onClick={() => onSelectPlan('yearly')}
            >
              {savings && (
                <PricingBadge
                  type="savings"
                  label={t('payment.planStage.savePercent', 'Save {{percent}}%', { percent: savings.percent })}
                />
              )}

              <Stack gap="md" style={{ height: '100%' }} justify="space-between">
                <Text size="lg" fw={600}>
                  {t('payment.yearly', 'Yearly')}
                </Text>

                <Divider />

                {isEnterprise && planGroup.yearly.seatPrice ? (
                  <Stack gap="sm">
                    <PriceDisplay
                      mode="enterprise"
                      basePrice={planGroup.yearly.price}
                      seatPrice={planGroup.yearly.seatPrice}
                      totalPrice={calculateMonthlyEquivalent(
                        calculateTotalWithSeats(planGroup.yearly.price, planGroup.yearly.seatPrice, seatCount)
                      )}
                      currency={planGroup.yearly.currency}
                      period="year"
                      seatCount={seatCount}
                      size="sm"
                    />
                    <Text size="sm" c="dimmed">
                      {t('payment.planStage.billedYearly', 'Billed yearly at {{currency}}{{amount}}', {
                        currency: planGroup.yearly.currency,
                        amount: calculateTotalWithSeats(planGroup.yearly.price, planGroup.yearly.seatPrice, seatCount).toFixed(2)
                      })}
                    </Text>
                  </Stack>
                ) : (
                  <Stack gap={0}>
                    <PriceDisplay
                      mode="simple"
                      price={calculateMonthlyEquivalent(planGroup.yearly?.price || 0)}
                      currency={planGroup.yearly?.currency || '£'}
                      period={t('payment.perMonth', '/month')}
                      size="2.5rem"
                    />
                    <Text size="sm" c="dimmed" mt="xs">
                      {t('payment.planStage.billedYearly', 'Billed yearly at {{currency}}{{amount}}', {
                        currency: planGroup.yearly?.currency,
                        amount: planGroup.yearly?.price.toFixed(2)
                      })}
                    </Text>
                  </Stack>
                )}

                {savings && (
                  <Alert color="green" variant="light" p="sm">
                    <Text size="sm" fw={600}>
                      {t('payment.planStage.savingsAmount', 'You save {{amount}}', {
                        amount: formatPrice(savings.amount, savings.currency)
                      })}
                    </Text>
                  </Alert>
                )}

                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                  <Button variant="filled" fullWidth size="lg">
                    {t('payment.planStage.selectYearly', 'Select Yearly')}
                  </Button>
                </div>
              </Stack>
            </Paper>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
};
