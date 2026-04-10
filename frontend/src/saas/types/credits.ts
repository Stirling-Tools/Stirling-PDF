export interface ApiCredits {
  weeklyCreditsRemaining: number;
  weeklyCreditsAllocated: number;
  boughtCreditsRemaining: number;
  totalBoughtCredits: number;
  totalAvailableCredits: number;
  weeklyResetDate: string;
  lastApiUsage: string;
}

export interface CreditSummary {
  currentCredits: number;
  maxCredits: number;
  creditsUsed: number;
  creditsRemaining: number;
  resetDate: string; // ISO date string
  weeklyAllowance: number;
}

export interface SubscriptionInfo {
  id?: string;
  status: "active" | "inactive" | "cancelled" | "expired";
  tier: "free" | "basic" | "premium" | "enterprise";
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  creditsPerWeek?: number;
  maxCredits?: number;
}

export interface CreditCheckResult {
  hasSufficientCredits: boolean;
  currentBalance: number;
  requiredCredits: number;
  shortfall?: number;
}
