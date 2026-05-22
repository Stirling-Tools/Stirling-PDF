import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCredits } from "@app/hooks/useCredits";
import { getToolCreditCost } from "@app/utils/creditCosts";
import { openPlanSettings } from "@app/utils/appSettings";
import type { ToolId } from "@app/types/toolId";

export function useCreditCheck(operationType?: string, _endpoint?: string) {
  const { hasSufficientCredits, isPro, creditBalance, refreshCredits } =
    useCredits();
  const { t } = useTranslation();

  const checkCredits = useCallback(
    async (_runtimeEndpoint?: string): Promise<string | null> => {
      const requiredCredits = getToolCreditCost(operationType as ToolId);
      const creditCheck = hasSufficientCredits(requiredCredits);

      if (creditBalance === null) {
        try {
          await refreshCredits();
        } catch (_e) {
          void _e;
        }
        return t("loadingCredits", "Checking credits...");
      }

      if (isPro === null) {
        return t("loadingProStatus", "Checking subscription status...");
      }

      if (!isPro && !creditCheck.hasSufficientCredits) {
        const shortfall = creditCheck.shortfall || 0;
        const error = t(
          "insufficientCredits",
          "Insufficient credits. Required: {{requiredCredits}}, Available: {{currentBalance}}, Shortfall: {{shortfall}}",
          {
            requiredCredits,
            currentBalance: creditCheck.currentBalance,
            shortfall,
          },
        );
        const notice = t(
          "noticeTopUpOrPlan",
          "Not enough credits, please top up or upgrade to a plan",
        );
        openPlanSettings(notice);
        return error;
      }

      return null;
    },
    [
      hasSufficientCredits,
      isPro,
      creditBalance,
      refreshCredits,
      operationType,
      t,
    ],
  );

  return { checkCredits };
}
