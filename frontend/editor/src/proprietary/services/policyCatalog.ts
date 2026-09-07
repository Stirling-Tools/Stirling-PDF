/**
 * The catalog of available policy *definitions* — the policy categories in
 * display order. This is the single seam through which definitions reach
 * consumers: nothing imports the static definitions directly, everything reads
 * the catalog through {@link loadPolicyCatalog}.
 *
 * Backed by the static `policyDefinitions` today; swap {@link loadPolicyCatalog}
 * for a fetch to move definitions server-side without touching any component.
 */

import { POLICY_CATEGORIES } from "@app/data/policyDefinitions";
import type { PolicyCategory } from "@app/types/policies";

export interface PolicyCatalog {
  /** Available policy types, in display order. */
  categories: PolicyCategory[];
}

/** Load the policy catalog. Swap this for a backend fetch to go live. */
export function loadPolicyCatalog(): PolicyCatalog {
  return { categories: POLICY_CATEGORIES };
}
