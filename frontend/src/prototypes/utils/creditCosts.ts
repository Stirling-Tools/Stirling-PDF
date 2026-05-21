import {
  CREDIT_COSTS,
  TOOL_CREDIT_COSTS as BASE_COSTS,
} from "@proprietary/utils/creditCosts";
import type { ToolId } from "@app/types/toolId";

export { CREDIT_COSTS } from "@proprietary/utils/creditCosts";

export const TOOL_CREDIT_COSTS: Partial<Record<ToolId, number>> = {
  ...BASE_COSTS,
  "ai-workflow": CREDIT_COSTS.XLARGE,
};

export const getToolCreditCost = (toolId: ToolId): number => {
  return TOOL_CREDIT_COSTS[toolId] ?? CREDIT_COSTS.MEDIUM;
};
