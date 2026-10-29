// Stripe API Types

export interface CreateCheckoutSessionRequest {
  planId: string;
  planName: string;
  planPrice: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResponse {
  clientSecret: string;
  sessionId: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      payment_status: "paid" | "unpaid";
      customer_details?: {
        email: string;
        name?: string;
      };
      metadata?: Record<string, string>;
    };
  };
}

export interface PaymentSuccessData {
  sessionId: string;
  planId: string;
  customerId: string;
  paymentIntentId: string;
  amountTotal: number;
  currency: string;
}

export interface ApiPackagePurchaseRequest {
  packageId: string;
  packageName: string;
  packagePrice: number;
  credits: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

// Error responses
export interface StripeApiError {
  error: string;
  message: string;
  code?: string;
}

// Webhook event types that the backend should handle
export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.expired"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";
