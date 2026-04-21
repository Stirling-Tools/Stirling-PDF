import { TrialStatus } from "@app/auth/UseSession";
import {
  FLOW_SEQUENCES,
  SlideId,
} from "@app/components/onboarding/saasOnboardingFlowConfig";

export interface FlowConfig {
  type: "saas-trial" | "saas-paid";
  ids: SlideId[];
}

/**
 * Resolves the appropriate onboarding flow based on user's subscription status.
 *
 * @param trialStatus - User's trial information from Supabase
 * @param _isPro - Whether user has Pro subscription
 * @returns FlowConfig with the appropriate slide sequence
 */
export function resolveSaasFlow(
  trialStatus: TrialStatus | null,
  _isPro: boolean | null,
): FlowConfig {
  // Show free trial card if:
  // 1. User has active trial (isTrialing = true)
  // 2. Trial has not expired (daysRemaining > 0)
  // 3. User is not paid Pro (or Pro is from trial)
  const hasActiveTrial =
    trialStatus?.isTrialing === true && trialStatus.daysRemaining > 0;

  if (hasActiveTrial) {
    return {
      type: "saas-trial",
      ids: FLOW_SEQUENCES.saasTrialUser,
    };
  }

  // For paid users, expired trials, or no trial info
  return {
    type: "saas-paid",
    ids: FLOW_SEQUENCES.saasPaidUser,
  };
}
