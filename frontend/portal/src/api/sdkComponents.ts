import { httpJson } from "@portal/api/http";
import type { ComponentsResponse } from "@portal/mocks/sdkComponents";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  BillingUnit,
  ComponentMaturity,
  ComponentPricing,
  ComponentProp,
  ComponentsResponse,
  ComponentsSummary,
  Framework,
  MaturityMeta,
  SdkComponent,
} from "@portal/mocks/sdkComponents";
export {
  BILLING_UNIT_LABEL,
  MATURITY_META,
  formatPrice,
  isUnlocked,
} from "@portal/mocks/sdkComponents";

/** GET /v1/components?tier=… — summary strip + the embeddable SDK catalogue. */
export async function fetchComponents(tier: Tier): Promise<ComponentsResponse> {
  return httpJson<ComponentsResponse>(
    `/v1/components?tier=${encodeURIComponent(tier)}`,
  );
}
