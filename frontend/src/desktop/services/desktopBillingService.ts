import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { supabase } from '@app/auth/supabase';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Billing status returned from Supabase edge function
 */
export interface BillingStatus {
  subscription: {
    id: string;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid';
    currentPeriodStart: number; // Unix timestamp
    currentPeriodEnd: number; // Unix timestamp
  } | null;
  meterUsage: {
    currentPeriodCredits: number; // Overage credits used
    estimatedCost: number; // In cents
  } | null;
  tier: 'free' | 'team' | 'enterprise';
  isTrialing: boolean;
  trialDaysRemaining?: number;
  price?: number; // Monthly price (in dollars)
  currency?: string; // Currency symbol (e.g., '$', '£')
}

/**
 * Response from manage-billing edge function
 */
interface ManageBillingResponse {
  url: string;
}

/**
 * Service for managing billing operations in desktop app (SaaS mode only)
 */
export class DesktopBillingService {
  private static instance: DesktopBillingService;

  static getInstance(): DesktopBillingService {
    if (!DesktopBillingService.instance) {
      DesktopBillingService.instance = new DesktopBillingService();
    }
    return DesktopBillingService.instance;
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
    console.log('[Desktop Billing] Fetching plan price...');

    const currencySymbols: { [key: string]: string } = {
      gbp: '£',
      usd: '$',
      eur: '€',
      cny: '¥',
      inr: '₹',
      brl: 'R$',
      idr: 'Rp',
      jpy: '¥',
    };

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
        const currency = currencySymbols[proPrice.currency.toLowerCase()] || proPrice.currency.toUpperCase();
        console.log('[Desktop Billing] Pro plan price:', currency + price);
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
    console.log('[Desktop Billing] Fetching billing status...');

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
      // Call Supabase edge function
      const { data, error } = await supabase.functions.invoke<{
        subscription: BillingStatus['subscription'];
        meterUsage: BillingStatus['meterUsage'];
      }>('get-usage-billing', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {},
      });

      if (error) {
        console.error('[Desktop Billing] Error fetching billing status:', error);
        throw new Error(error.message || 'Failed to fetch billing status');
      }

      if (!data) {
        throw new Error('No data returned from get-usage-billing');
      }

      // Determine tier based on subscription status
      let tier: BillingStatus['tier'] = 'free';
      let isTrialing = false;
      let trialDaysRemaining: number | undefined;
      let price: number | undefined;
      let currency: string | undefined;

      if (data.subscription) {
        // Assume Team plan if subscription exists (could be extended to check metadata)
        tier = 'team';

        if (data.subscription.status === 'trialing') {
          isTrialing = true;
          const trialEnd = data.subscription.currentPeriodEnd;
          const now = Math.floor(Date.now() / 1000);
          trialDaysRemaining = Math.ceil((trialEnd - now) / (24 * 60 * 60));
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

      const billingStatus: BillingStatus = {
        subscription: data.subscription,
        meterUsage: data.meterUsage,
        tier,
        isTrialing,
        trialDaysRemaining,
        price,
        currency,
      };

      console.log('[Desktop Billing] Billing status fetched:', {
        tier,
        isTrialing,
        hasSubscription: !!data.subscription,
        hasMeteredBilling: !!data.meterUsage,
      });

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
    console.log('[Desktop Billing] Opening billing portal...');

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

      console.log('[Desktop Billing] Opening billing portal in browser:', data.url);

      // Open in system browser (same pattern as OAuth)
      await shellOpen(data.url);

      console.log('[Desktop Billing] Billing portal opened successfully');
    } catch (error) {
      console.error('[Desktop Billing] Failed to open billing portal:', error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to open billing portal');
    }
  }

  /**
   * Open Stripe checkout in system browser (for upgrades)
   * Note: This is a placeholder for future implementation
   */
  async openCheckout(tier: 'team' | 'enterprise', returnUrl: string): Promise<void> {
    console.log('[Desktop Billing] Opening checkout for tier:', tier);

    // TODO: Implement checkout session creation
    // For now, we can direct users to the web SaaS for upgrades
    throw new Error('Checkout is not yet implemented. Please use the web app to upgrade.');
  }
}

export const desktopBillingService = DesktopBillingService.getInstance();
