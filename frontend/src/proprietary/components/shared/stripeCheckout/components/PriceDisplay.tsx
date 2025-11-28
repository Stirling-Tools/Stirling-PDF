import React from 'react';
import { Text, Stack } from '@mantine/core';
import { formatPrice } from '@app/components/shared/stripeCheckout/utils/pricingUtils';
import { PRICE_FONT_WEIGHT } from '@app/components/shared/stripeCheckout/utils/cardStyles';

interface SimplePriceProps {
  mode: 'simple';
  price: number;
  currency: string;
  period: string;
  size?: string;
}

interface EnterprisePriceProps {
  mode: 'enterprise';
  basePrice: number;
  seatPrice: number;
  totalPrice?: number;
  currency: string;
  period: 'month' | 'year';
  seatCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

type PriceDisplayProps = SimplePriceProps | EnterprisePriceProps;

export const PriceDisplay: React.FC<PriceDisplayProps> = (props) => {
  if (props.mode === 'simple') {
    const fontSize = props.size || '2.25rem';
    return (
      <>
        <Text size={fontSize} fw={PRICE_FONT_WEIGHT} style={{ lineHeight: 1 }}>
          {formatPrice(props.price, props.currency)}
        </Text>
        <Text size="sm" c="dimmed" mt="xs">
          {props.period}
        </Text>
      </>
    );
  }

  // Enterprise mode
  const { basePrice, seatPrice, totalPrice, currency, period, seatCount, size = 'md' } = props;
  const fontSize = size === 'lg' ? '2rem' : size === 'sm' ? 'md' : 'xl';
  const totalFontSize = size === 'lg' ? '2rem' : '2rem';

  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Base Price
        </Text>
        <Text size={fontSize} fw={PRICE_FONT_WEIGHT}>
          {formatPrice(basePrice, currency)}
          <Text component="span" size="sm" c="dimmed" fw={400}>
            {' '}
            /{period}
          </Text>
        </Text>
      </div>
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Per Seat
        </Text>
        <Text size={fontSize} fw={PRICE_FONT_WEIGHT}>
          {formatPrice(seatPrice, currency)}
          <Text component="span" size="sm" c="dimmed" fw={400}>
            {' '}
            /seat/{period}
          </Text>
        </Text>
      </div>
      {totalPrice !== undefined && seatCount && (
        <div>
          <Text size="sm" c="dimmed" mb="xs">
            Total ({seatCount} seats)
          </Text>
          <Text size={totalFontSize} fw={PRICE_FONT_WEIGHT} style={{ lineHeight: 1 }}>
            {formatPrice(totalPrice, currency)}
            <Text component="span" size="sm" c="dimmed" fw={400}>
              {' '}
              /{period === 'year' ? 'month' : period}
            </Text>
          </Text>
        </div>
      )}
    </Stack>
  );
};
