/**
 * Shared pricing utilities for plan cards and checkout
 */

export interface PriceCalculation {
  displayPrice: number;
  displaySeatPrice?: number;
  displayCurrency: string;
}

/**
 * Calculate monthly equivalent from yearly price
 */
export function calculateMonthlyEquivalent(yearlyPrice: number): number {
  return yearlyPrice / 12;
}

/**
 * Calculate total price including seats
 */
export function calculateTotalWithSeats(
  basePrice: number,
  seatPrice: number | undefined,
  seatCount: number
): number {
  if (seatPrice === undefined) return basePrice;
  return basePrice + seatPrice * seatCount;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string, decimals: number = 2): string {
  return `${currency}${amount.toFixed(decimals)}`;
}

/**
 * Calculate display pricing for a plan, showing yearly price divided by 12
 * to show the lowest monthly equivalent
 */
export function calculateDisplayPricing(
  monthly?: { price: number; seatPrice?: number; currency: string },
  yearly?: { price: number; seatPrice?: number; currency: string }
): PriceCalculation {
  // Default to monthly if no yearly exists
  if (!yearly) {
    return {
      displayPrice: monthly?.price || 0,
      displaySeatPrice: monthly?.seatPrice,
      displayCurrency: monthly?.currency || '£',
    };
  }

  // Use yearly price divided by 12 for best value display
  return {
    displayPrice: calculateMonthlyEquivalent(yearly.price),
    displaySeatPrice: yearly.seatPrice ? calculateMonthlyEquivalent(yearly.seatPrice) : undefined,
    displayCurrency: yearly.currency,
  };
}
