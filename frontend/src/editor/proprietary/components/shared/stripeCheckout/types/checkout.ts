import { PlanTierGroup } from "@app/services/licenseService";

export interface StripeCheckoutProps {
  /**
   * Put the period and capacity choices on one page instead of walking them separately. Nothing
   * precedes it: the buyer is never asked for an address, so the combined page is the first thing
   * the flow opens on. Ignored for tiers that do not sell capacity.
   */
  combinedChoose?: boolean;
  /** Users the current plan covers, or null when there is none. Drives the add-capacity face. */
  currentLimit?: number | null;
  /** Present only for a self-hosted server above its actual allowance. */
  capacityNotice?: { users: number; limit: number };
  opened: boolean;
  onClose: () => void;
  planGroup: PlanTierGroup;
  minimumSeats?: number;
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
  onLicenseActivated?: (licenseInfo: {
    licenseType: string;
    enabled: boolean;
    maxUsers: number;
    hasKey: boolean;
  }) => void;
  hostedCheckoutSuccess?: {
    isUpgrade: boolean;
    licenseKey?: string;
  } | null;
}

export type CheckoutStage =
  /**
   * Billing period and capacity on one page. The separate {@code plan-selection} and {@code
   * capacity} stages remain for the flows that still walk them one at a time.
   */
  "choose" | "plan-selection" | "capacity" | "payment" | "success" | "error";

export type CheckoutState = {
  currentStage: CheckoutStage;
  email?: string;
  clientSecret?: string;
  error?: string;
  sessionId?: string;
  loading?: boolean;
};

export type PollingStatus = "idle" | "polling" | "ready" | "timeout";

export interface SavingsCalculation {
  amount: number;
  percent: number;
  currency: string;
}
