import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { supabase } from '@app/auth/supabase';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_URL, STIRLING_SAAS_BACKEND_API_URL, SUPABASE_KEY } from '@app/constants/connection';
import type { TierLevel, SubscriptionStatus, StripePlanId } from '@app/types/billing';
import { getCurrencySymbol } from '@app/config/billing';

/**
 * Billing status returned from Supabase edge function
 */
export interface BillingStatus {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    currentPeriodStart: number; // Unix timestamp
    currentPeriodEnd: number; // Unix timestamp
  } | null;
  meterUsage: {
    currentPeriodCredits: number; // Overage credits used
    estimatedCost: number; // In cents
  } | null;
  tier: TierLevel;
  isTrialing: boolean;
  trialDaysRemaining?: number;
  price?: number; // Monthly price (in dollars)
  currency?: string; // Currency symbol (e.g., '$', '£')
  creditBalance?: number; // Real-time remaining credits
}

/**
 * Response from manage-billing edge function
 */
interface ManageBillingResponse {
  url: string;
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
 * Service for managing SaaS billing operations (Stripe + Supabase)
 * Desktop-layer implementation using Tauri APIs for browser integration
 */
export class SaasBillingService {
  private static instance: SaasBillingService;

  static getInstance(): SaasBillingService {
    if (!SaasBillingService.instance) {
      SaasBillingService.instance = new SaasBillingService();
    }
    return SaasBillingService.instance;
  }

  /**
   * Check if billing features are available (SaaS mode only)
   */
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

  /**
   * Fetch Pro plan price from Stripe
   * Calls stripe-price-lookup edge function to get current pricing
   */
  private async fetchPlanPrice(
    token: string,
    currencyCode: string = 'usd'
  ): Promise<{ price: number; currency: string }> {
    try {
      const { data, error } = await supabase.functions.invoke<{
        prices: Record<string, { unit_amount: number; currency: string }>;
        missing: string[];
      }>('stripe-price-lookup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          lookup_keys: ['plan:pro'],
          currency: currencyCode,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch plan price');
      }

      if (!data || !data.prices) {
        throw new Error('No pricing data returned');
      }

      const proPrice = data.prices['plan:pro'];
      if (proPrice) {
        const price = proPrice.unit_amount / 100; // Convert cents to dollars
        const currency = getCurrencySymbol(proPrice.currency);
        return { price, currency };
      }

      // Fallback if price not found
      throw new Error('Pro plan price not found');
    } catch (error) {
      console.error('[Desktop Billing] Error fetching plan price:', error);
      throw error;
    }
  }

  /**
   * Fetch billing status from Supabase edge function
   * Calls get-usage-billing which returns subscription + meter usage data
   */
  async getBillingStatus(): Promise<BillingStatus> {
    // Check if in SaaS mode
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing is only available in SaaS mode');
    }

    // Get JWT token for authentication
    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      // Call RPC via REST API using Tauri fetch (Supabase client RPC may not work in Tauri)
      const rpcUrl = `${STIRLING_SAAS_URL}/rest/v1/rpc/get_user_billing_status`;

      const response = await tauriFetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY || '',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Desktop Billing] RPC error response:', errorText);
        throw new Error(`RPC call failed: ${response.status} ${response.statusText}`);
      }

      // RPC may return an array or a single object — normalise to array then take first element
      const raw = await response.json() as unknown;
      const billingDataArray = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      const billingData = billingDataArray[0] as {
        user_id: string;
        has_metered_billing_enabled: boolean;
        is_pro: boolean;
      } | undefined;

      // Determine tier based on pro status
      const isPro = billingData?.is_pro || false;
      const tier: BillingStatus['tier'] = isPro ? 'team' : 'free';

      // Fetch additional subscription details if pro
      let subscription: BillingStatus['subscription'] = null;
      let meterUsage: BillingStatus['meterUsage'] = null;
      let isTrialing = false;
      let trialDaysRemaining: number | undefined;
      let price: number | undefined;
      let currency: string | undefined;

      if (isPro) {
        // Fetch usage details
        try {
          const { data: usageData, error: usageError } = await supabase.functions.invoke<{
            subscription: BillingStatus['subscription'];
            meterUsage: BillingStatus['meterUsage'];
          }>('get-usage-billing', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: {},
          });

          if (!usageError && usageData) {
            subscription = usageData.subscription;
            meterUsage = usageData.meterUsage;

            if (subscription?.status === 'trialing') {
              isTrialing = true;
              const trialEnd = subscription.currentPeriodEnd;
              const now = Math.floor(Date.now() / 1000);
              trialDaysRemaining = Math.ceil((trialEnd - now) / (24 * 60 * 60));
            }
          }
        } catch (usageError) {
          console.warn('[Desktop Billing] Failed to fetch usage data:', usageError);
        }

        // Fetch the current Pro plan price from Stripe
        try {
          const priceData = await this.fetchPlanPrice(token, 'usd');
          price = priceData.price;
          currency = priceData.currency;
        } catch (error) {
          console.warn('[Desktop Billing] Failed to fetch plan price, using default:', error);
          // Fallback to default pricing
          price = 10;
          currency = '$';
        }
      }

      // Fetch credit balance for all authenticated users (both Pro and Free)
      // Use backend API endpoint /api/v1/credits (same as SaaS web)
      let creditBalance: number | undefined;
      try {
        const creditsEndpoint = `${STIRLING_SAAS_BACKEND_API_URL}/api/v1/credits`;
        const creditResponse = await tauriFetch(creditsEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (creditResponse.ok) {
          const creditData = await creditResponse.json();
          // Backend returns { totalAvailableCredits: number, ... }
          const credits = creditData?.totalAvailableCredits;
          creditBalance = typeof credits === 'number' ? credits : 0;
        } else {
          const errorText = await creditResponse.text();
          console.warn('[Desktop Billing] Failed to fetch credit balance:', creditResponse.status, errorText);
          creditBalance = 0;
        }
      } catch (error) {
        console.error('[Desktop Billing] Error fetching credit balance:', error);
        creditBalance = 0;
      }

      const billingStatus: BillingStatus = {
        subscription,
        meterUsage,
        tier,
        isTrialing,
        trialDaysRemaining,
        price,
        currency,
        creditBalance,
      };

      return billingStatus;
    } catch (error) {
      console.error('[Desktop Billing] Failed to fetch billing status:', error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to fetch billing status');
    }
  }

  /**
   * Open Stripe billing portal in system browser
   * Calls manage-billing edge function to get portal URL
   */
  async openBillingPortal(returnUrl: string): Promise<void> {
    // Check if in SaaS mode
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing portal is only available in SaaS mode');
    }

    // Get JWT token for authentication
    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      // Call Supabase edge function to get Stripe portal URL
      const { data, error } = await supabase.functions.invoke<ManageBillingResponse>('manage-billing', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          return_url: returnUrl,
        },
      });

      if (error) {
        console.error('[Desktop Billing] Error creating billing portal session:', error);
        throw new Error(error.message || 'Failed to create billing portal session');
      }

      if (!data || !data.url) {
        throw new Error('No portal URL returned from manage-billing');
      }

      // Open in system browser (same pattern as OAuth)
      await shellOpen(data.url);
    } catch (error) {
      console.error('[Desktop Billing] Failed to open billing portal:', error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to open billing portal');
    }
  }

  /**
   * Fetch available plan pricing from Stripe
   * Calls stripe-price-lookup edge function to get current pricing for all plans
   */
  async getAvailablePlans(currencyCode: string = 'usd'): Promise<Map<string, PlanPrice>> {
    // Check if in SaaS mode
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Billing is only available in SaaS mode');
    }

    // Get JWT token for authentication
    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      const { data, error } = await supabase.functions.invoke<{
        prices: Record<string, { unit_amount: number; currency: string }>;
        missing: string[];
      }>('stripe-price-lookup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          lookup_keys: ['plan:pro', 'meter:overage'],
          currency: currencyCode,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch plan pricing');
      }

      if (!data || !data.prices) {
        throw new Error('No pricing data returned');
      }

      // Map prices with currency symbols
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

  /**
   * Open Stripe checkout for plan upgrades in system browser
   * Creates hosted checkout session and opens in browser
   */
  async openCheckout(planId: StripePlanId, returnUrl: string): Promise<void> {
    // Check if in SaaS mode
    const isAvailable = await this.isBillingAvailable();
    if (!isAvailable) {
      throw new Error('Checkout is only available in SaaS mode');
    }

    // Get JWT token for authentication
    const token = await authService.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    try {
      // Call Supabase edge function to create checkout session
      // Use 'hosted' mode for browser redirect instead of 'embedded'
      const { data, error } = await supabase.functions.invoke<{ url: string }>('create-checkout', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          ui_mode: 'hosted',
          success_url: `${returnUrl}/checkout/success`,
          cancel_url: `${returnUrl}/checkout/cancel`,
          purchase_type: 'subscription',
          plan: planId,
        },
      });

      if (error) {
        console.error('[Desktop Billing] Error creating checkout session:', error);
        throw new Error(error.message || 'Failed to create checkout session');
      }

      if (!data || !data.url) {
        console.error('[Desktop Billing] Invalid response data:', data);
        throw new Error('No checkout URL returned from create-checkout');
      }

      // Open in system browser (same pattern as billing portal)
      await shellOpen(data.url);
    } catch (error) {
      console.error('[Desktop Billing] Failed to create checkout session:', error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to create checkout session');
    }
  }
}

export const saasBillingService = SaasBillingService.getInstance();
