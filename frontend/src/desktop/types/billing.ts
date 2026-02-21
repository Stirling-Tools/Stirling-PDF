/**
 * Shared types for SaaS billing system
 * Used across billing service, contexts, and components
 */

/**
 * Plan tier levels (string union for tier identification)
 */
export type TierLevel = 'free' | 'team' | 'enterprise';

/**
 * Stripe subscription status values
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

/**
 * Stripe plan IDs (Stripe API naming)
 * Note: UI uses 'team' but Stripe uses 'pro'
 */
export type StripePlanId = 'pro' | 'enterprise';

/**
 * Plan IDs used in the application (UI naming)
 */
export type PlanId = 'team' | 'enterprise';
