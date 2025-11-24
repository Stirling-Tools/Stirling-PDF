import { PlanTierGroup } from '@app/services/licenseService';
import { SavingsCalculation } from '@app/components/shared/stripeCheckout/types/checkout';

/**
 * Calculate savings for yearly vs monthly plans
 * Returns null if both monthly and yearly plans are not available
 */
export const calculateSavings = (
  planGroup: PlanTierGroup,
  minimumSeats: number
): SavingsCalculation | null => {
  if (!planGroup.yearly || !planGroup.monthly) return null;

  const isEnterprise = planGroup.tier === 'enterprise';
  const seatCount = minimumSeats || 1;

  let monthlyAnnual: number;
  let yearlyTotal: number;

  if (isEnterprise && planGroup.monthly.seatPrice && planGroup.yearly.seatPrice) {
    // Enterprise: (base + seats) * 12 vs (base + seats) yearly
    monthlyAnnual = (planGroup.monthly.price + (planGroup.monthly.seatPrice * seatCount)) * 12;
    yearlyTotal = planGroup.yearly.price + (planGroup.yearly.seatPrice * seatCount);
  } else {
    // Server: price * 12 vs yearly price
    monthlyAnnual = planGroup.monthly.price * 12;
    yearlyTotal = planGroup.yearly.price;
  }

  const savings = monthlyAnnual - yearlyTotal;
  const savingsPercent = Math.round((savings / monthlyAnnual) * 100);

  return {
    amount: savings,
    percent: savingsPercent,
    currency: planGroup.yearly.currency
  };
};
