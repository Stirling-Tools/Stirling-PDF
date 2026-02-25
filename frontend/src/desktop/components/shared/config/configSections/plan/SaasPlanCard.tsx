import React from 'react';
import { Button, Card, Badge, Text, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTier } from '@app/hooks/useSaaSPlans';
import { FeatureListItem } from '@app/components/shared/modals/FeatureListItem';
import type { TierLevel } from '@app/types/billing';

interface SaasPlanCardProps {
  plan: PlanTier;
  isCurrentPlan?: boolean;
  currentTier?: TierLevel;
  onUpgradeClick?: (plan: PlanTier) => void;
}

export const SaasPlanCard: React.FC<SaasPlanCardProps> = ({
  plan,
  isCurrentPlan,
  currentTier,
  onUpgradeClick
}) => {
  const { t } = useTranslation();

  // Free plan is included if user has Team or Enterprise tier
  const isIncluded = plan.id === 'free' && (currentTier === 'team' || currentTier === 'enterprise');

  // Determine card styling based on plan type
  const getCardStyle = () => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
      borderWidth: 1,
      position: 'relative',
      overflow: 'visible',
    };

    if (plan.id === 'free' && isCurrentPlan) {
      return {
        ...baseStyle,
        borderColor: 'var(--border-default)',
        opacity: 0.85,
      };
    }

    if (plan.popular) {
      return {
        ...baseStyle,
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.1)',
      };
    }

    return baseStyle;
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (plan.popular && !isCurrentPlan) {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = '0 12px 48px rgba(59, 130, 246, 0.3)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (plan.popular && !isCurrentPlan) {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.1)';
    }
  };

  const handleClick = () => {
    if (plan.popular && !isCurrentPlan && onUpgradeClick) {
      onUpgradeClick(plan);
    }
  };

  return (
    <Card
      key={plan.id}
      padding="md"
      radius="md"
      withBorder
      style={getCardStyle()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {plan.popular && (
        <Badge
          size="sm"
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgb(59, 130, 246)',
            color: 'white',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            paddingLeft: '12px',
            paddingRight: '12px',
          }}
        >
          {t('plan.popular', 'Popular')}
        </Badge>
      )}

      <Stack gap="sm" className="h-full">
        <div>
          <Text size="md" fw={600} mb="xs">{plan.name}</Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {plan.isContactOnly ? t('plan.customPricing', 'Custom') : `${plan.currency}${plan.price}`}
            </Text>
            {!plan.isContactOnly && (
              <Text size="sm" c="dimmed">
                {plan.period}
              </Text>
            )}
          </Group>
          <Text size="xs" fw={400} c="dimmed">
            {plan.isContactOnly
              ? t('plan.enterprise.siteLicense', 'Site License')
              : plan.id === 'free'
                ? `50 ${t('credits.modal.monthlyCredits', 'monthly credits')}`
                : plan.overagePrice
                  ? `500 ${t('credits.modal.monthlyCredits', 'monthly credits')} + ${plan.currency}${plan.overagePrice.toFixed(2)}/${t('credits.modal.overage', 'overage')}`
                  : `500 ${t('credits.modal.monthlyCredits', 'monthly credits')}`
            }
          </Text>
        </div>

        <Stack gap="xs">
          <Text size="xs" fw={500} mb="xs">
            {plan.id === 'free'
              ? t('credits.modal.forRegularWork', 'For regular PDF work:')
              : plan.id === 'enterprise'
                ? t('credits.modal.everythingInCredits', 'Everything in Credits, plus:')
                : t('credits.modal.everythingInFree', 'Everything in Free, plus:')
            }
          </Text>
          {plan.highlights.map((highlight: string, index: number) => (
            <FeatureListItem
              key={index}
              included
              color={plan.id === 'free' ? 'var(--mantine-color-gray-6)' : 'var(--color-primary-600)'}
              size="xs"
            >
              {highlight}
            </FeatureListItem>
          ))}
        </Stack>

        <div className="flex-grow" />

        <Button
          variant={isCurrentPlan || isIncluded ? "subtle" : plan.isContactOnly ? "outline" : "filled"}
          color={plan.isContactOnly ? undefined : "blue"}
          disabled={isCurrentPlan || isIncluded}
          fullWidth
          size="sm"
          radius="lg"
          onClick={(e) => {
            e.stopPropagation();
            onUpgradeClick?.(plan);
          }}
          style={{
            fontWeight: 600,
            ...((isCurrentPlan || isIncluded) && {
              background: 'transparent',
              border: 'none',
              cursor: 'default',
            }),
            ...(plan.isContactOnly && {
              borderColor: 'var(--text-primary)',
              color: 'var(--text-primary)',
            }),
          }}
          component={plan.isContactOnly ? 'a' : undefined}
          href={plan.isContactOnly ? `mailto:contact@stirlingpdf.com?subject=${plan.name} Plan Inquiry` : undefined}
        >
          {isCurrentPlan
            ? t('plan.current', 'Current Plan')
            : isIncluded
            ? t('plan.included', 'Included')
            : plan.isContactOnly
            ? t('plan.contact', 'Contact Sales')
            : t('plan.upgrade', 'Upgrade')
          }
        </Button>
      </Stack>
    </Card>
  );
};
