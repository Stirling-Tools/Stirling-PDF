import apiClient from '@app/services/apiClient';
import { supabase, isSupabaseConfigured } from '@app/services/supabaseClient';
import { getCheckoutMode } from '@app/utils/protocolDetection';
import { PLAN_FEATURES, PLAN_HIGHLIGHTS } from '@app/constants/planConstants';
import type { LicenseInfo, PlanFeature } from '@app/types/license';

export interface PlanTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  popular?: boolean;
  features: PlanFeature[];
  highlights: readonly string[];
  isContactOnly?: boolean;
  seatPrice?: number;        // Per-seat price for enterprise plans
  requiresSeats?: boolean;   // Flag indicating seat selection is needed
  lookupKey: string;         // Stripe lookup key for this plan
}

export interface PlanTierGroup {
  tier: 'free' | 'server' | 'enterprise';
  name: string;
  monthly: PlanTier | null;
  yearly: PlanTier | null;
  features: PlanFeature[];
  highlights: readonly string[];
  popular?: boolean;
}

export interface PlansResponse {
  plans: PlanTier[];
}

export interface CheckoutSessionRequest {
  lookup_key: string;       // Stripe lookup key (e.g., 'selfhosted:server:monthly')
  installation_id?: string; // Installation ID from backend (MAC-based fingerprint)
  current_license_key?: string; // Current license key for upgrades
  requires_seats?: boolean; // Whether to add adjustable seat pricing
  seat_count?: number;      // Initial number of seats for enterprise plans (user can adjust in Stripe UI)
  email?: string;           // Customer email for checkout pre-fill
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResponse {
  clientSecret: string;
  sessionId: string;
  url?: string;  // URL for hosted checkout (when not using HTTPS)
}

export interface BillingPortalResponse {
  url: string;
}

export interface InstallationIdResponse {
  installationId: string;
}

export interface LicenseKeyResponse {
  status: 'ready' | 'pending';
  license_key?: string;
  email?: string;
  plan?: string;
}

export type { LicenseInfo, PlanFeature };

export interface LicenseSaveResponse {
  success: boolean;
  licenseType?: string;
  filename?: string;
  filePath?: string;
  enabled?: boolean;
  maxUsers?: number;
  message?: string;
  error?: string;
}

// Currency symbol mapping
const getCurrencySymbol = (currency: string): string => {
  const currencySymbols: { [key: string]: string } = {
    'gbp': '£',
    'usd': '$',
    'eur': '€',
    'cny': '¥',
    'inr': '₹',
    'brl': 'R$',
    'idr': 'Rp'
  };
  return currencySymbols[currency.toLowerCase()] || currency.toUpperCase();
};

// Self-hosted plan lookup keys
const SELF_HOSTED_LOOKUP_KEYS = [
  'selfhosted:server:monthly',
  'selfhosted:server:yearly',
  'selfhosted:enterpriseseat:monthly',
  'selfhosted:enterpriseseat:yearly',
];

const licenseService = {
  /**
   * Get available plans with pricing for the specified currency
   */
  async getPlans(currency: string = 'usd'): Promise<PlansResponse> {
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Please use static plans instead.');
      }

      // Fetch all self-hosted prices from Stripe
      const { data, error } = await supabase.functions.invoke<{
        prices: Record<string, {
          unit_amount: number;
          currency: string;
          lookup_key: string;
        }>;
        missing: string[];
      }>('stripe-price-lookup', {
        body: {
          lookup_keys: SELF_HOSTED_LOOKUP_KEYS,
          currency
        },
      });

      if (error) {
        throw new Error(`Failed to fetch plans: ${error.message}`);
      }

      if (!data || !data.prices) {
        throw new Error('No pricing data returned');
      }

      // Log missing prices for debugging
      if (data.missing && data.missing.length > 0) {
        console.warn('Missing Stripe prices for lookup keys:', data.missing, 'in currency:', currency);
      }

      // Build price map for easy access
      const priceMap = new Map<string, { unit_amount: number; currency: string }>();
      for (const [lookupKey, priceData] of Object.entries(data.prices)) {
        priceMap.set(lookupKey, {
          unit_amount: priceData.unit_amount,
          currency: priceData.currency
        });
      }

      const currencySymbol = getCurrencySymbol(currency);

      // Helper to get price info
      const getPriceInfo = (lookupKey: string, fallback: number = 0) => {
        const priceData = priceMap.get(lookupKey);
        return priceData ? priceData.unit_amount / 100 : fallback;
      };

      // Build plan tiers
      const plans: PlanTier[] = [
        {
          id: 'selfhosted:server:monthly',
          lookupKey: 'selfhosted:server:monthly',
          name: 'Server - Monthly',
          price: getPriceInfo('selfhosted:server:monthly'),
          currency: currencySymbol,
          period: '/month',
          popular: false,
          features: PLAN_FEATURES.SERVER,
          highlights: PLAN_HIGHLIGHTS.SERVER_MONTHLY
        },
        {
          id: 'selfhosted:server:yearly',
          lookupKey: 'selfhosted:server:yearly',
          name: 'Server - Yearly',
          price: getPriceInfo('selfhosted:server:yearly'),
          currency: currencySymbol,
          period: '/year',
          popular: true,
          features: PLAN_FEATURES.SERVER,
          highlights: PLAN_HIGHLIGHTS.SERVER_YEARLY
        },
        {
          id: 'selfhosted:enterprise:monthly',
          lookupKey: 'selfhosted:server:monthly',
          name: 'Enterprise - Monthly',
          price: getPriceInfo('selfhosted:server:monthly'),
          seatPrice: getPriceInfo('selfhosted:enterpriseseat:monthly'),
          currency: currencySymbol,
          period: '/month',
          popular: false,
          requiresSeats: true,
          features: PLAN_FEATURES.ENTERPRISE,
          highlights: PLAN_HIGHLIGHTS.ENTERPRISE_MONTHLY
        },
        {
          id: 'selfhosted:enterprise:yearly',
          lookupKey: 'selfhosted:server:yearly',
          name: 'Enterprise - Yearly',
          price: getPriceInfo('selfhosted:server:yearly'),
          seatPrice: getPriceInfo('selfhosted:enterpriseseat:yearly'),
          currency: currencySymbol,
          period: '/year',
          popular: false,
          requiresSeats: true,
          features: PLAN_FEATURES.ENTERPRISE,
          highlights: PLAN_HIGHLIGHTS.ENTERPRISE_YEARLY
        },
      ];

      // Filter out plans with missing prices (price === 0 means Stripe price not found)
      const validPlans = plans.filter(plan => plan.price > 0);

      if (validPlans.length < plans.length) {
        const missingPlans = plans.filter(plan => plan.price === 0).map(p => p.id);
        console.warn('Filtered out plans with missing prices:', missingPlans);
      }

      // Add Free plan (static definition)
      const freePlan: PlanTier = {
        id: 'free',
        lookupKey: 'free',
        name: 'Free',
        price: 0,
        currency: currencySymbol,
        period: '',
        popular: false,
        features: PLAN_FEATURES.FREE,
        highlights: PLAN_HIGHLIGHTS.FREE
      };

      const allPlans = [freePlan, ...validPlans];

      return {
        plans: allPlans
      };
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  },

  /**
   * Group plans by tier for display (Free, Server, Enterprise)
   */
  groupPlansByTier(plans: PlanTier[]): PlanTierGroup[] {
    const groups: PlanTierGroup[] = [];

    // Free tier
    const freePlan = plans.find(p => p.id === 'free');
    if (freePlan) {
      groups.push({
        tier: 'free',
        name: 'Free',
        monthly: freePlan,
        yearly: null,
        features: freePlan.features,
        highlights: freePlan.highlights,
        popular: false,
      });
    }

    // Server tier
    const serverMonthly = plans.find(p => p.lookupKey === 'selfhosted:server:monthly');
    const serverYearly = plans.find(p => p.lookupKey === 'selfhosted:server:yearly');
    if (serverMonthly || serverYearly) {
      groups.push({
        tier: 'server',
        name: 'Server',
        monthly: serverMonthly || null,
        yearly: serverYearly || null,
        features: (serverMonthly || serverYearly)!.features,
        highlights: (serverMonthly || serverYearly)!.highlights,
        popular: serverYearly?.popular || serverMonthly?.popular || false,
      });
    }

    // Enterprise tier (uses server pricing + seats)
    const enterpriseMonthly = plans.find(p => p.id === 'selfhosted:enterprise:monthly');
    const enterpriseYearly = plans.find(p => p.id === 'selfhosted:enterprise:yearly');
    if (enterpriseMonthly || enterpriseYearly) {
      groups.push({
        tier: 'enterprise',
        name: 'Enterprise',
        monthly: enterpriseMonthly || null,
        yearly: enterpriseYearly || null,
        features: (enterpriseMonthly || enterpriseYearly)!.features,
        highlights: (enterpriseMonthly || enterpriseYearly)!.highlights,
        popular: false,
      });
    }

    return groups;
  },

  /**
   * Create a Stripe checkout session for upgrading
   */
  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    // Check if Supabase is configured
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Checkout is not available.');
    }

    // Detect if HTTPS is available to determine checkout mode
    const checkoutMode = getCheckoutMode();
    const baseUrl = window.location.origin;
    const settingsUrl = `${baseUrl}/settings/adminPlan`;

    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        self_hosted: true,
        lookup_key: request.lookup_key,
        installation_id: request.installation_id,
        current_license_key: request.current_license_key,
        requires_seats: request.requires_seats,
        seat_count: request.seat_count || 1,
        email: request.email,
        callback_base_url: baseUrl,
        ui_mode: checkoutMode,
        // For hosted checkout, provide success/cancel URLs
        success_url: checkoutMode === 'hosted'
          ? `${settingsUrl}?session_id={CHECKOUT_SESSION_ID}&payment_status=success`
          : undefined,
        cancel_url: checkoutMode === 'hosted'
          ? `${settingsUrl}?payment_status=canceled`
          : undefined,
      },
    });

    if (error) {
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }

    return data as CheckoutSessionResponse;
  },

  /**
   * Create a Stripe billing portal session for managing subscription
   * Uses license key for self-hosted authentication
   */
  async createBillingPortalSession(returnUrl: string, licenseKey: string): Promise<BillingPortalResponse> {
    // Check if Supabase is configured
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Billing portal is not available.');
    }

    const { data, error} = await supabase.functions.invoke('manage-billing', {
      body: {
        return_url: returnUrl,
        license_key: licenseKey,
        self_hosted: true  // Explicitly indicate self-hosted mode
      },
    });

    if (error) {
      throw new Error(`Failed to create billing portal session: ${error.message}`);
    }

    return data as BillingPortalResponse;
  },

  /**
   * Get the installation ID from the backend (MAC-based fingerprint)
   */
  async getInstallationId(): Promise<string> {
    try {
      const response = await apiClient.get('/api/v1/admin/installation-id');

      const data: InstallationIdResponse = await response.data;
      return data.installationId;
    } catch (error) {
      console.error('Error fetching installation ID:', error);
      throw error;
    }
  },

  /**
   * Check if license key is ready for the given installation ID
   */
  async checkLicenseKey(installationId: string): Promise<LicenseKeyResponse> {
    // Check if Supabase is configured
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. License key lookup is not available.');
    }

    const { data, error } = await supabase.functions.invoke('get-license-key', {
      body: {
        installation_id: installationId,
      },
    });

    if (error) {
      throw new Error(`Failed to check license key: ${error.message}`);
    }

    return data as LicenseKeyResponse;
  },

  /**
   * Save license key to backend
   */
  async saveLicenseKey(licenseKey: string): Promise<LicenseSaveResponse> {
    try {
      const response = await apiClient.post('/api/v1/admin/license-key', {
        licenseKey: licenseKey,
      });

      return response.data;
    } catch (error) {
      console.error('Error saving license key:', error);
      throw error;
    }
  },

  /**
   * Upload license certificate file for offline activation
   * @param file - The .lic or .cert file to upload
   * @returns Promise with upload result
   */
  async saveLicenseFile(file: File): Promise<LicenseSaveResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post('/api/v1/admin/license-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading license file:', error);
      throw error;
    }
  },

  /**
   * Get current license information from backend
   */
  async getLicenseInfo(): Promise<LicenseInfo> {
    try {
      const response = await apiClient.get('/api/v1/admin/license-info');
      return response.data;
    } catch (error) {
      console.error('Error fetching license info:', error);
      throw error;
    }
  },

  /**
   * Resync the current license with Keygen
   * Re-validates the existing license key and updates local settings
   */
  async resyncLicense(): Promise<LicenseSaveResponse> {
    try {
      const response = await apiClient.post('/api/v1/admin/license/resync');
      return response.data;
    } catch (error) {
      console.error('Error resyncing license:', error);
      throw error;
    }
  },

  /**
   * Update enterprise seat count
   * Creates a Stripe billing portal session for confirming seat changes
   * @param newSeatCount - New number of seats
   * @param licenseKey - Current license key for authentication
   * @returns Billing portal URL for confirming the change
   */
  async updateEnterpriseSeats(newSeatCount: number, licenseKey: string): Promise<string> {
    // Check if Supabase is configured
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Seat updates are not available.');
    }

    const baseUrl = window.location.origin;
    const returnUrl = `${baseUrl}/settings/adminPlan?seats_updated=true`;

    const { data, error } = await supabase.functions.invoke('manage-billing', {
      body: {
        return_url: returnUrl,
        license_key: licenseKey,
        self_hosted: true,
        new_seat_count: newSeatCount,
      },
    });

    if (error) {
      throw new Error(`Failed to update seat count: ${error.message}`);
    }

    if (!data || !data.url) {
      throw new Error('No billing portal URL returned');
    }

    return data.url;
  },
};

/**
 * Map license type to plan tier
 * @param licenseInfo - Current license information
 * @returns Plan tier: 'free' | 'server' | 'enterprise'
 */
export const mapLicenseToTier = (licenseInfo: LicenseInfo | null): 'free' | 'server' | 'enterprise' | null => {
  if (!licenseInfo) return null;

  // No license or NORMAL type = Free tier
  if (licenseInfo.licenseType === 'NORMAL' || !licenseInfo.enabled) {
    return 'free';
  }

  // SERVER type (unlimited users) = Server tier
  if (licenseInfo.licenseType === 'SERVER') {
    return 'server';
  }

  // ENTERPRISE type (with seats) = Enterprise tier
  if (licenseInfo.licenseType === 'ENTERPRISE' && licenseInfo.maxUsers > 0) {
    return 'enterprise';
  }

  // Default fallback
  return 'free';
};

export default licenseService;
