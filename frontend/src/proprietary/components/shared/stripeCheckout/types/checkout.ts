import { PlanTierGroup } from '@app/services/licenseService';

export interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  planGroup: PlanTierGroup;
  minimumSeats?: number;
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
  onLicenseActivated?: (licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => void;
  hostedCheckoutSuccess?: {
    isUpgrade: boolean;
    licenseKey?: string;
  } | null;
}

export type CheckoutStage = 'email' | 'plan-selection' | 'payment' | 'success' | 'error';

export type CheckoutState = {
  currentStage: CheckoutStage;
  email?: string;
  clientSecret?: string;
  error?: string;
  sessionId?: string;
  loading?: boolean;
};

export type PollingStatus = 'idle' | 'polling' | 'ready' | 'timeout';

export interface SavingsCalculation {
  amount: number;
  percent: number;
  currency: string;
}
