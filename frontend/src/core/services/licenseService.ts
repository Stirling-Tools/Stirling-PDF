import apiClient from '@app/services/apiClient';

export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface PlanTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  popular?: boolean;
  features: PlanFeature[];
  highlights: string[];
  isContactOnly?: boolean;
}

export interface SubscriptionInfo {
  plan: PlanTier;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'none';
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface PlansResponse {
  plans: PlanTier[];
  currentSubscription: SubscriptionInfo;
}

export interface CheckoutSessionRequest {
  planId: string;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  clientSecret: string;
  sessionId: string;
}

export interface BillingPortalResponse {
  url: string;
}

const licenseService = {
  /**
   * Get available plans with pricing for the specified currency
   */
  async getPlans(currency: string = 'gbp'): Promise<PlansResponse> {
    const response = await apiClient.get<PlansResponse>(`/api/v1/license/plans`, {
      params: { currency },
    });
    return response.data;
  },

  /**
   * Get current subscription details
   */
  async getCurrentSubscription(): Promise<SubscriptionInfo> {
    const response = await apiClient.get<SubscriptionInfo>('/api/v1/license/subscription');
    return response.data;
  },

  /**
   * Create a Stripe checkout session for upgrading
   */
  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    const response = await apiClient.post<CheckoutSessionResponse>(
      '/api/v1/license/checkout',
      request
    );
    return response.data;
  },

  /**
   * Create a Stripe billing portal session for managing subscription
   */
  async createBillingPortalSession(returnUrl: string): Promise<BillingPortalResponse> {
    const response = await apiClient.post<BillingPortalResponse>('/api/v1/license/billing-portal', {
      returnUrl,
    });
    return response.data;
  },
};

export default licenseService;
