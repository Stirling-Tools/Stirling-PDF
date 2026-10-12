import type { Wallet } from "@app/billing/types";

/** Pending usage consumes the remaining free grant and prepaid pool before the meter. */
export function pendingMeteredUnits(
  wallet: Wallet,
  pendingUnits: number,
): number {
  if (!wallet.processor.active) return 0;
  return Math.max(
    0,
    pendingUnits - wallet.freeRemaining - wallet.prepaidUnitsRemaining,
  );
}

/** Estimated metered charges including unsynced usage; null preserves an unknown rate. */
export function estimatedBillWithPending(
  wallet: Wallet,
  pendingUnits: number,
): number | null {
  if (wallet.estimatedBillMinor == null) return null;
  return (
    wallet.estimatedBillMinor +
    pendingMeteredUnits(wallet, pendingUnits) * (wallet.pricePerDocMinor ?? 0)
  );
}
