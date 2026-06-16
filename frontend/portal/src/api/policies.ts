import { httpJson } from "@portal/api/http";
import type { PoliciesResponse } from "@portal/mocks/policies";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  PoliciesResponse,
  PoliciesSummary,
  PolicyCategory,
  PolicyCategoryConfig,
  PolicyCategoryMeta,
  PolicyField,
  PolicyFieldKind,
  PolicyFieldOption,
  PolicyOverride,
} from "@portal/mocks/policies";
export {
  POLICY_CATEGORIES,
  POLICY_CATEGORY_META,
  tierMeetsRequirement,
} from "@portal/mocks/policies";

/** GET /v1/policies?tier=… — summary strip + the five category configs. */
export async function fetchPolicies(tier: Tier): Promise<PoliciesResponse> {
  return httpJson<PoliciesResponse>(
    `/v1/policies?tier=${encodeURIComponent(tier)}`,
  );
}
