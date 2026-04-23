import { useAuth } from "@app/auth/UseSession";

/**
 * Hook for credit management and checking in tools.
 * Provides easy access to credit balance, subscription info, and validation functions.
 */
export const useCredits = () => {
  const {
    creditBalance,
    subscription,
    creditSummary,
    isPro,
    hasSufficientCredits,
    updateCredits,
    refreshCredits,
  } = useAuth();

  /**
   * Get user-friendly credit status message
   */
  const getCreditStatusMessage = (): string => {
    if (creditBalance === 0) {
      return "No credits remaining";
    }
    if (creditBalance === null) {
      return "Credits loading...";
    }
    return `${creditBalance} credits available`;
  };

  return {
    // State
    creditBalance,
    subscription,
    creditSummary,
    isPro,

    // Actions
    refreshCredits,
    updateCredits,

    // Utilities
    getCreditStatusMessage,
    hasSufficientCredits,
  };
};
