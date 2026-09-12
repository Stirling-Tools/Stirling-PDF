import { PlanTierGroup } from "@app/services/licenseService";

export interface StripeCheckoutProps {
  /**
   * Put the period and capacity choices on one page instead of walking them separately. Independent
   * of {@link initialEmail}: a buyer who still has to type an address gets the email page in front
   * of the combined one rather than the long walk behind it.
   */
  combinedChoose?: boolean;
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
