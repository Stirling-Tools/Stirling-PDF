import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_BACKEND_API_URL } from '@app/constants/connection';
import type { TierLevel, SubscriptionStatus, StripePlanId } from '@app/types/billing';
import { getCurrencySymbol } from '@app/config/billing';

/**
 * Billing status returned from backend API
 */
export interface BillingStatus {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    currentPeriodStart: number;
    currentPeriodEnd: number;
  } | null;
  meterUsage: {
    currentPeriodCredits: number;
    estimatedCost: number;
  } | null;
  tier: TierLevel;
  isTrialing: boolean;
  trialDaysRemaining?: number;
  creditBalance?: number;
}

/**
 * Plan pricing information
 */
export interface PlanPrice {
  price: number;
  currency: string;
  overagePrice?: number;
}

/**
 * Service for managing SaaS billing operations via backend API.
 * Desktop-layer implementation using Tauri APIs for browser integration.
 */
export class SaasBillingService {
  private static instance: SaasBillingService;

  static getInstance(): SaasBillingService {
    if (!SaasBillingService.instance) {
      SaasBillingService.instance = new SaasBillingService();
    }
    return SaasBillingService.instance;
  }

  private get apiBase(): string {
    return STIRLING_SAAS_BACKEND_API_URL || '';
  }

  async isBillingAvailable(): Promise<boolean> {
    try {
      const mode = await connectionModeService.getCurrentMode();
      const isAuthenticated = await authService.isAuthenticated();
      return mode === 'saas' && isAuthenticated;
    } catch (error) {
      console.error('[Desktop Billing] Failed to check billing availability:', error);
      return false;
    }
  }

  async getBillingStatus(): Promise<BillingStatus> {
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing is only available in SaaS mode');
    }

    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      // Fetch plan status from backend
      const planResponse = await tauriFetch(`${this.apiBase}/api/v1/user/plan-status`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const planData = planResponse.ok ? await planResponse.json() as { isPro?: boolean } : { isPro: false };
      const isPro = planData?.isPro || false;
      const tier: BillingStatus['tier'] = isPro ? 'team' : 'free';

      // Fetch credit balance
      let creditBalance: number | undefined;
      try {
        const creditResponse = await tauriFetch(`${this.apiBase}/api/v1/credits`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (creditResponse.ok) {
          const creditData = await creditResponse.json() as { totalAvailableCredits?: number };
          creditBalance = typeof creditData?.totalAvailableCredits === 'number' ? creditData.totalAvailableCredits : 0;
        } else {
          creditBalance = 0;
        }
      } catch (error) {
        console.error('[Desktop Billing] Error fetching credit balance:', error);
        creditBalance = 0;
      }

      // Fetch trial status
      let isTrialing = false;
      let trialDaysRemaining: number | undefined;
      try {
        const trialResponse = await tauriFetch(`${this.apiBase}/api/v1/user/trial-status`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (trialResponse.ok) {
          const trialData = await trialResponse.json() as { isTrialing?: boolean; daysRemaining?: number };
          isTrialing = trialData?.isTrialing || false;
          trialDaysRemaining = trialData?.daysRemaining;
        }
      } catch {
        // Trial status not available
      }

      return {
        subscription: null,
        meterUsage: null,
        tier,
        isTrialing,
        trialDaysRemaining,
        creditBalance,
      };
    } catch (error) {
      console.error('[Desktop Billing] Failed to fetch billing status:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to fetch billing status', { cause: error });
    }
  }

  async openBillingPortal(returnUrl: string): Promise<void> {
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing portal is only available in SaaS mode');
    }

    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      const response = await tauriFetch(`${this.apiBase}/api/v1/billing/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ return_url: returnUrl }),
      });

      if (!response.ok) throw new Error(`Portal request failed: ${response.status}`);
      const data = await response.json() as { url?: string };
      if (!data?.url) throw new Error('No portal URL returned');

      await shellOpen(data.url);
    } catch (error) {
      console.error('[Desktop Billing] Failed to open billing portal:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to open billing portal', { cause: error });
    }
  }

  async getAvailablePlans(currencyCode: string = 'usd'): Promise<Map<string, PlanPrice>> {
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing is only available in SaaS mode');
    }

    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      const response = await tauriFetch(
        `${this.apiBase}/api/v1/billing/prices?lookup_keys=plan:pro,meter:overage&currency=${currencyCode}`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error(`Pricing request failed: ${response.status}`);
      const data = await response.json() as { prices?: Record<string, { unit_amount: number; currency: string }> };

      if (!data?.prices) throw new Error('No pricing data returned');

      const plans = new Map<string, PlanPrice>();
      const proPrice = data.prices['plan:pro'];
      const overagePrice = data.prices['meter:overage'];

      if (proPrice) {
        plans.set('team', {
          price: proPrice.unit_amount / 100,
          currency: getCurrencySymbol(proPrice.currency),
          overagePrice: overagePrice ? overagePrice.unit_amount / 100 : 0.05,
        });
      }

      return plans;
    } catch (error) {
      console.error('[Desktop Billing] Error fetching available plans:', error);
      throw error;
    }
  }

  async openCheckout(planId: StripePlanId, returnUrl: string): Promise<void> {
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Checkout is only available in SaaS mode');
    }

    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      const response = await tauriFetch(`${this.apiBase}/api/v1/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ui_mode: 'hosted',
          success_url: `${returnUrl}/checkout/success`,
          cancel_url: `${returnUrl}/checkout/cancel`,
          purchase_type: 'subscription',
          plan: planId,
        }),
      });

      if (!response.ok) throw new Error(`Checkout request failed: ${response.status}`);
      const data = await response.json() as { url?: string };
      if (!data?.url) throw new Error('No checkout URL returned');

      await shellOpen(data.url);
    } catch (error) {
      console.error('[Desktop Billing] Failed to create checkout session:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to create checkout session', { cause: error });
    }
  }
}

export const saasBillingService = SaasBillingService.getInstance();
