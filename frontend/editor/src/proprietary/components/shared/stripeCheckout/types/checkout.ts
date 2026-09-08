import { PlanTierGroup } from "@app/services/licenseService";

export interface StripeCheckoutProps {
  /**
   * The buyer's billing email when the caller already holds it. Supplying it skips the email step
   * and opens on the combined choose page, which is page 1 of 2.
   */
  initialEmail?: string;
  /** Users the current plan covers, or null when there is none. Drives the add-capacity face. */
  currentLimit?: number | null;
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
  | "email"
  /**
   * Billing period and capacity on one page. The design puts both choices in front of the buyer at
   * once, so this is page 1 of 2 wherever the email is already known; the separate
   * {@code plan-selection} and {@code capacity} stages remain for the flows that still walk them
   * one at a time.
   */
  | "choose"
  | "plan-selection"
  | "capacity"
  | "payment"
  | "success"
  | "error";

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
