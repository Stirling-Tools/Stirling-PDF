/**
 * Shared utilities for plan tier comparisons and button logic
 */

export type PlanTier = 'free' | 'server' | 'enterprise';

const TIER_HIERARCHY: Record<PlanTier, number> = {
  'free': 1,
  'server': 2,
  'enterprise': 3,
};

/**
 * Get numeric level for a tier
 */
export function getTierLevel(tier: PlanTier | string | null | undefined): number {
  if (!tier) return 1;
  return TIER_HIERARCHY[tier as PlanTier] || 1;
}

/**
 * Check if target tier is the current tier
 */
export function isCurrentTier(currentTier: PlanTier | string | null | undefined, targetTier: PlanTier | string): boolean {
  return getTierLevel(currentTier) === getTierLevel(targetTier);
}

/**
 * Check if target tier is a downgrade from current tier
 */
export function isDowngrade(currentTier: PlanTier | string | null | undefined, targetTier: PlanTier | string): boolean {
  return getTierLevel(currentTier) > getTierLevel(targetTier);
}

/**
 * Check if enterprise is blocked for free tier users
 */
export function isEnterpriseBlockedForFree(currentTier: PlanTier | string | null | undefined, targetTier: PlanTier | string): boolean {
  return currentTier === 'free' && targetTier === 'enterprise';
}
